/**
 * services/gemini.ts
 * ──────────────────
 * Shared Gemini helper using direct REST API calls.
 * Uses the v1 endpoint which supports current models (gemini-2.5-flash-lite etc).
 *
 * Exported functions:
 *   getGeminiModel(options?)   — returns a thin model wrapper
 *   callGeminiJSON(prompt)     — calls Gemini and parses the JSON response
 *   callGeminiText(prompt)     — calls Gemini and returns plain text
 *   startGeminiChat(...)       — starts a chat session with history
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface GeminiModelOptions {
    /** Gemini model name. Default: 'gemini-2.5-flash-lite' */
    model?: string;
    /** Response temperature 0–2. Default 0.2. */
    temperature?: number;
    /** Force JSON output via responseMimeType. */
    forceJson?: boolean;
    /** System-level instruction. */
    systemInstruction?: string;
}

interface GeminiPart { text: string }
interface GeminiContent { role: string; parts: GeminiPart[] }

// ── Core REST caller ──────────────────────────────────────────────────────────

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta';

async function callGeminiRaw(
    contents: GeminiContent[],
    options: GeminiModelOptions = {},
    retryCount = 0,
): Promise<string> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('GEMINI_API_KEY is not configured in .env.local');

    const {
        model = 'gemini-2.5-flash-lite',
        temperature = 0.2,
        forceJson = false,
        systemInstruction,
    } = options;

    const url = `${GEMINI_BASE}/models/${model}:generateContent?key=${apiKey}`;

    const body: Record<string, unknown> = {
        contents,
        generationConfig: {
            temperature,
        },
    };

    if (systemInstruction) {
        body.systemInstruction = { parts: [{ text: systemInstruction }] };
    }

    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });

    if (!res.ok) {
        const errText = await res.text();

        if (res.status === 429) {
            throw new Error(
                'The AI service is temporarily unavailable due to usage limits. ' +
                'Please wait a moment and try again.',
            );
        }

        // Parse error message from Google's JSON response if possible
        let friendlyMsg = 'The AI service is currently unavailable. Please try again.';
        try {
            const errJson = JSON.parse(errText);
            const detail = errJson?.error?.message ?? '';
            const code = errJson?.error?.code ?? res.status;
            if (code === 401 || detail.includes('authentication') || detail.includes('credentials') || detail.includes('API key')) {
                friendlyMsg = 'Invalid Gemini API key. Please replace GEMINI_API_KEY in .env.local with a valid key starting with AIzaSy… from https://aistudio.google.com/app/apikey';
            } else if (detail.includes('not found') || code === 404) {
                friendlyMsg = 'AI model is unavailable. Please try again later.';
            } else if (code === 503 || detail.includes('demand') || detail.includes('UNAVAILABLE')) {
                // Auto-retry up to 2 times with increasing delay on 503
                if (retryCount < 2) {
                    await new Promise((r) => setTimeout(r, 2000 * (retryCount + 1)));
                    return callGeminiRaw(contents, options, retryCount + 1);
                }
                friendlyMsg = 'The AI service is temporarily busy. Please wait a moment and try again.';
            }
        } catch { /* ignore parse failures */ }

        console.error('[AquaVitals] Gemini REST error:', res.status, errText.slice(0, 200));
        throw new Error(friendlyMsg);
    }

    const data = await res.json();
    const text: string = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

    if (!text) throw new Error('Gemini returned an empty response.');
    return text.trim();
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * callGeminiJSON<T>()
 * Calls Gemini with forceJson=true and parses the response as JSON.
 */
export async function callGeminiJSON<T = Record<string, unknown>>(
    prompt: string,
    options: GeminiModelOptions = {},
): Promise<T> {
    const raw = await callGeminiRaw(
        [{ role: 'user', parts: [{ text: prompt }] }],
        { ...options, forceJson: true },
    );

    // Robust extraction: find outermost { … } in case of extra text
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start === -1 || end === -1) {
        throw new Error(`Gemini did not return valid JSON. Response: ${raw.slice(0, 200)}`);
    }

    return JSON.parse(raw.slice(start, end + 1)) as T;
}

/**
 * callGeminiText()
 * Calls Gemini and returns plain text.
 */
export async function callGeminiText(
    prompt: string,
    options: GeminiModelOptions = {},
): Promise<string> {
    return callGeminiRaw(
        [{ role: 'user', parts: [{ text: prompt }] }],
        options,
    );
}

/**
 * callGeminiChat()
 * Sends a full conversation history + new user message to Gemini.
 * Used by /api/chat to maintain conversation context.
 *
 * @param history     Prior turns in { role: 'user'|'model', parts }[] format
 * @param userMessage The new user message to send
 * @param options     Model options including systemInstruction
 */
export async function callGeminiChat(
    history: GeminiContent[],
    userMessage: string,
    options: GeminiModelOptions = {},
): Promise<string> {
    const contents: GeminiContent[] = [
        ...history,
        { role: 'user', parts: [{ text: userMessage }] },
    ];

    return callGeminiRaw(contents, options);
}

/**
 * getGeminiModel()
 * Legacy shim — kept so existing callers that do model.startChat() still work.
 * New code should use callGeminiJSON / callGeminiText / callGeminiChat directly.
 */
export function getGeminiModel(options: GeminiModelOptions = {}) {
    return {
        options,
        startChat(init: { history?: GeminiContent[] }) {
            const history = init?.history ?? [];
            return {
                async sendMessage(text: string): Promise<{ response: { text: () => string } }> {
                    const reply = await callGeminiChat(history, text, options);
                    // Push the exchange into local history for multi-turn consistency
                    history.push({ role: 'user', parts: [{ text }] });
                    history.push({ role: 'model', parts: [{ text: reply }] });
                    return { response: { text: () => reply } };
                },
            };
        },
        async generateContent(prompt: string): Promise<{ response: { text: () => string } }> {
            const reply = await callGeminiRaw(
                [{ role: 'user', parts: [{ text: prompt }] }],
                options,
            );
            return { response: { text: () => reply } };
        },
    };
}
