/**
 * services/gemini.ts
 * ──────────────────
 * AI service helper — Chat, Analysis, Translation use Sarvam AI.
 * Image analysis uses Gemini Vision separately in /api/image-analysis.
 *
 * Reads: SARVAM_API_KEY from .env.local
 */

export interface GeminiModelOptions {
    model?: string;
    temperature?: number;
    forceJson?: boolean;
    systemInstruction?: string;
}

export interface GeminiContent {
    role: string;
    parts: { text: string }[];
}

interface SarvamMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

// ── Core Sarvam caller ────────────────────────────────────────────────────────

async function callSarvam(
    messages: SarvamMessage[],
    options: GeminiModelOptions = {},
    retryCount = 0,
): Promise<string> {
    const apiKey = process.env.SARVAM_API_KEY;
    if (!apiKey) throw new Error('SARVAM_API_KEY is not configured in .env.local');

    const { model = 'sarvam-30b', temperature = 0.2 } = options;

    const res = await fetch('https://api.sarvam.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ model, messages, temperature, max_tokens: 4000 }),
    });

    if (!res.ok) {
        const errText = await res.text();

        if (res.status === 429) {
            if (retryCount < 2) {
                await new Promise((r) => setTimeout(r, 2000 * (retryCount + 1)));
                return callSarvam(messages, options, retryCount + 1);
            }
            throw new Error('The AI service is temporarily unavailable due to usage limits. Please wait and try again.');
        }

        let msg = 'The AI service is currently unavailable. Please try again.';
        try {
            const j = JSON.parse(errText);
            const d = j?.error?.message ?? '';
            const c = j?.error?.code ?? res.status;
            if (c === 401 || d.includes('authentication')) msg = 'Invalid Sarvam API key. Please check your SARVAM_API_KEY in .env.local';
            else if (c === 503 || d.includes('UNAVAILABLE') || d.includes('demand')) {
                if (retryCount < 2) {
                    await new Promise((r) => setTimeout(r, 2000 * (retryCount + 1)));
                    return callSarvam(messages, options, retryCount + 1);
                }
                msg = 'The AI service is temporarily busy. Please wait a moment and try again.';
            }
        } catch { /* ignore */ }

        console.error('[AquaVitals] Sarvam error:', res.status, errText.slice(0, 200));
        throw new Error(msg);
    }

    const data = await res.json();
    const m = data?.choices?.[0]?.message;
    const content = m?.content ?? m?.reasoning_content ?? '';
    if (!content) throw new Error('Sarvam returned an empty response.');
    return content.trim();
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function callGeminiJSON<T = Record<string, unknown>>(
    prompt: string,
    options: GeminiModelOptions = {},
): Promise<T> {
    const msgs: SarvamMessage[] = [];
    if (options.systemInstruction) msgs.push({ role: 'system', content: options.systemInstruction });
    msgs.push({ role: 'user', content: prompt });

    const raw = await callSarvam(msgs, options);
    const start = raw.indexOf('{');
    if (start === -1) throw new Error('AI did not return valid JSON. Try again.');

    // Walk from the first { counting brace depth to find the matching }
    // This is robust against } inside string values and trailing reasoning text
    let depth = 0, end = -1, inStr = false, esc = false;
    for (let i = start; i < raw.length; i++) {
        const ch = raw[i];
        if (esc) { esc = false; continue; }
        if (ch === '\\') { esc = true; continue; }
        if (ch === '"') { inStr = !inStr; continue; }
        if (inStr) continue;
        if (ch === '{') depth++;
        else if (ch === '}') { depth--; if (depth === 0) { end = i; break; } }
    }
    if (end === -1) throw new Error('AI did not return valid JSON. Try again.');

    try {
        return JSON.parse(raw.slice(start, end + 1)) as T;
    } catch {
        console.error('[AquaVitals] JSON parse failed. Snippet:', raw.slice(start, start + 200));
        throw new Error('AI returned malformed JSON. Please try again.');
    }
}

export async function callGeminiText(
    prompt: string,
    options: GeminiModelOptions = {},
): Promise<string> {
    const msgs: SarvamMessage[] = [];
    if (options.systemInstruction) msgs.push({ role: 'system', content: options.systemInstruction });
    msgs.push({ role: 'user', content: prompt });
    return callSarvam(msgs, options);
}

export async function callGeminiChat(
    history: GeminiContent[],
    userMessage: string,
    options: GeminiModelOptions = {},
): Promise<string> {
    const msgs: SarvamMessage[] = [];
    if (options.systemInstruction) msgs.push({ role: 'system', content: options.systemInstruction });
    for (const turn of history) {
        msgs.push({ role: turn.role === 'user' ? 'user' : 'assistant', content: turn.parts.map((p) => p.text).join('\n') });
    }
    msgs.push({ role: 'user', content: userMessage });
    return callSarvam(msgs, options);
}

/** Legacy shim — kept for backward compatibility */
export function getGeminiModel(options: GeminiModelOptions = {}) {
    return {
        options,
        startChat(init: { history?: GeminiContent[] }) {
            const history = init?.history ?? [];
            return {
                async sendMessage(text: string): Promise<{ response: { text: () => string } }> {
                    const reply = await callGeminiChat(history, text, options);
                    history.push({ role: 'user', parts: [{ text }] });
                    history.push({ role: 'model', parts: [{ text: reply }] });
                    return { response: { text: () => reply } };
                },
            };
        },
        async generateContent(prompt: string): Promise<{ response: { text: () => string } }> {
            const reply = await callGeminiText(prompt, options);
            return { response: { text: () => reply } };
        },
    };
}
