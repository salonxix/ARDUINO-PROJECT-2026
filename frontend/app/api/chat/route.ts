/**
 * app/api/chat/route.ts
 * ─────────────────────
 * POST /api/chat
 *
 * Receives a conversation history from the client, enriches the prompt
 * with LIVE sensor data from Firebase (if available), then sends
 * everything to Google Gemini and returns the AI reply.
 *
 * Uses shared helpers:
 *   - services/firebaseReader  → getLatestSensorReading(), formatSensorForPrompt()
 *   - services/gemini          → getGeminiModel()
 *
 * Request body:
 *   { messages: Array<{ role: 'user' | 'assistant', text: string }> }
 *
 * Response (success):  { reply: string }
 * Response (error):    { error: string }
 */

import { NextRequest, NextResponse } from 'next/server';
import { callGeminiChat } from '@/services/gemini';
import { getLatestSensorReading, formatSensorForPrompt } from '@/services/firebaseReader';
import {
    loadKnowledge,
    searchKnowledge,
    formatChunksForPrompt,
} from '@/services/knowledge';

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
    try {
        // ── 1. Parse request body ─────────────────────────────────────────────────
        const body = await req.json();
        const messages: Array<{ role: 'user' | 'assistant'; text: string }> =
            body.messages ?? [];
        // 'english' or 'kannada' — defaults to english if not provided
        const language: string = (body.language ?? 'english').toLowerCase();

        if (!messages.length) {
            return NextResponse.json({ error: 'No messages provided.' }, { status: 400 });
        }

        // The last message must always be from the user
        const latestMessage = messages[messages.length - 1];
        if (latestMessage.role !== 'user') {
            return NextResponse.json(
                { error: 'Last message must be from the user.' },
                { status: 400 },
            );
        }

        // ── 2. Fetch live sensor data from Firebase (non-blocking) ────────────────
        const reading = await getLatestSensorReading();
        const sensorContext = reading
            ? `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nCURRENT LIVE WATER SENSOR READING\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n${formatSensorForPrompt(reading)}\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\nWHO GUIDELINES (reference):\n- pH: 6.5–8.5  |  TDS: <300 ppm  |  Turbidity: <1 NTU\n- Temperature: 10–25°C  |  Gas ADC: <150\n\nIMPORTANT: These are REAL LIVE readings. When answering any question about the user's water, base your answer on these specific values — do NOT ask the user to provide readings.`
            : null;

        // ── 2b. Load research knowledge and find relevant chunks ──────────────────
        await loadKnowledge();
        const researchChunks = searchKnowledge(latestMessage.text, 5);
        const researchContext = researchChunks.length
            ? formatChunksForPrompt(researchChunks, 2000)
            : null;

        // ── 3. Build the system instruction ──────────────────────────────────────
        const languageInstruction = language === 'kannada'
            ? `LANGUAGE INSTRUCTION: You MUST respond entirely in natural, conversational Kannada (ಕನ್ನಡ). Do NOT translate word-by-word. Use simple everyday Kannada that any Kannada speaker understands. Technical terms like pH, TDS, WQI, RO Filter, UV, WHO may remain in English. Use natural Kannada greetings and sentence structure. Example: "ನಿಮ್ಮ ನೀರು ಕುಡಿಯಲು ಸುರಕ್ಷಿತವಾಗಿಲ್ಲ." If you cannot respond in Kannada, fall back to English.`
            : language === 'hindi'
                ? `LANGUAGE INSTRUCTION: You MUST respond entirely in natural, conversational Hindi (हिन्दी). Do NOT translate word-by-word. Use simple everyday Hindi that anyone understands. Technical terms like pH, TDS, WQI, RO Filter, UV, WHO may remain in English. Use natural Hindi greetings and sentence structure. Example: "आपका पानी पीने के लिए सुरक्षित नहीं है।" If you cannot respond in Hindi, fall back to English.`
                : `LANGUAGE INSTRUCTION: Respond completely in English.`;

        const systemInstruction = [
            sensorContext,
            researchContext,
            languageInstruction,
            `You are AquaVitals AI — a friendly and knowledgeable water quality assistant.
You help users understand water quality sensor readings (pH, TDS, turbidity, temperature, gas, WQI).
You explain things in simple language that anyone can understand.
You give practical advice about water safety, treatment methods, and associated risks.
Keep responses under 200 words unless a detailed explanation is genuinely needed.
Use emojis occasionally to stay friendly.
Always base answers on WHO water quality guidelines.
You must NEVER diagnose diseases or prescribe medicines. Instead say "possible risks associated with these water characteristics include...".
${sensorContext
                ? 'You have access to the LIVE sensor readings shown above. Use them to give specific, personalised advice.'
                : 'No live sensor data is available. Answer generally based on WHO guidelines.'}
${researchContext
                ? 'You also have access to excerpts from peer-reviewed research papers and field datasets above. Use them to enrich and back up your answers where relevant.'
                : ''}`,
        ]
            .filter(Boolean)
            .join('\n\n');

        // ── 4. Build Gemini chat history ──────────────────────────────────────────
        // Convert prior messages to Gemini format (user / model roles).
        // The last message is sent separately as the new prompt.
        // Rules Gemini enforces:
        //   - History must start with a 'user' turn (not 'model')
        //   - Turns must strictly alternate user → model → user → model
        // We enforce this by:
        //   1. Stripping all prior messages (all n-1), then
        //   2. Dropping any leading 'model' turns
        //   3. Collapsing consecutive same-role turns into one
        const rawHistory = messages.slice(0, -1).map((m) => ({
            role: m.role === 'user' ? 'user' : 'model',
            parts: [{ text: m.text }],
        }));

        // Drop leading model turns — Gemini requires history to start with user
        let start = 0;
        while (start < rawHistory.length && rawHistory[start].role === 'model') start++;
        const trimmedHistory = rawHistory.slice(start);

        // Collapse consecutive same-role turns (merge texts) to ensure alternation
        const history: { role: string; parts: { text: string }[] }[] = [];
        for (const turn of trimmedHistory) {
            const last = history[history.length - 1];
            if (last && last.role === turn.role) {
                last.parts[0].text += '\n' + turn.parts[0].text;
            } else {
                history.push({ ...turn });
            }
        }

        // ── 5. Call Gemini with full history + new message ────────────────────────
        const reply = await callGeminiChat(history, latestMessage.text, {
            systemInstruction,
            temperature: 0.4,
        });

        if (!reply) {
            return NextResponse.json(
                { error: 'Gemini returned an empty response. Try again.' },
                { status: 500 },
            );
        }

        return NextResponse.json({ reply });

    } catch (err: unknown) {
        console.error('[AquaVitals] /api/chat error:', err);
        const message = err instanceof Error ? err.message : 'Something went wrong. Please try again.';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
