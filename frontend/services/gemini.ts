/**
 * services/gemini.ts
 * ──────────────────
 * Shared AI helper — now powered by Sarvam AI (sarvam-30b).
 * Uses the OpenAI-compatible /v1/chat/completions endpoint.
 *
 * Sarvam does NOT support image/vision input.
 * /api/image-analysis uses its own Gemini call for vision.
 *
 * Exported functions:
 *   callGeminiJSON(prompt, options)              — structured JSON response
 *   callGeminiText(prompt, options)              — plain text response
 *   callGeminiChat(history, userMsg, options)    — multi-turn chat
 *   getGeminiModel(options)                      — legacy shim
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface GeminiModelOptions {
    /** Model name. Default: 'sarvam-30b' */
    model?: string;
    /** Temperature 0–2. Default: 0.2 */
    temperature?: number;
    /** Unused — kept for API compatibility */
    forceJson?: boolean;
    /** System-level instruction */
    systemInstruction?: string;
}

interface ChatMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

export interface GeminiContent {
    role: string;
    parts: { text: string }[];
}

// ── Core caller ───────────────────────────────────────────────────────────────

const SARVAM_URL = 'https://api.sarvam.ai/v1/chat/completions';
const DEFAULT_MODEL = 'sarvam-30b';

async function callSarvam(
    messages: ChatMessage[],
    options: GeminiModelOptions = {},
    retryCount = 0,
): Promise<string> {
    const apiKey = process.env.SARVAM_API_KEY;
    if (!apiKey) throw new Error('SARVAM_API_KEY is not configured in .env.local');

    const { model = DEFAULT_MODEL, temperature = 0.2 } = options;

    const res = await fetch(SARVAM_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
            model,
            messages,
            temperature,
            max_tokens: 4000,
        }),
    });

    if (!res.ok) {
        const errText = await res.text();

        if (res.status === 429) {
            if (retryCount < 2) {
                await new Promise((r) => setTimeout(r, 2000 * (retryCount + 1)));
                return callSarvam(messages, options, retryCount + 1);
            }
            throw new Error('The AI service is temporarily busy due to usage limits. Please wait and try again.');
        }

        let friendlyMsg = 'The AI service is currently unavailable. Please try again.';
        try {
            const errJson = JSON.parse(errText);
            const detail = errJson?.error?.message ?? '';
            const code = errJson?.error?.code ?? res.status;
            if (code === 401 || detail.includes('authentication') || detail.includes('credentials')) {
                friendlyMsg = 'Invalid Sarvam API key. Please check your SARVAM_API_KEY in .env.local';
            } else if (detail.includes('deprecated') || detail.includes('not found')) {
                friendlyMsg = 'AI model unavailable. Please try again later.';
            } else if (code === 503 || detail.includes('UNAVAILABLE') || detail.includes('demand')) {
                if (retryCount < 2) {
                    await new Promise((r) => setTimeout(r, 2000 * (retryCount + 1)));
                    return callSarvam(messages, options, retryCount + 1);
                }
                friendlyMsg = 'The AI service is temporarily busy. Please wait a moment and try again.';
            }
        } catch { /* ignore */ }

        console.error('[AquaVitals] Sarvam error:', res.status, errText.slice(0, 200));
        throw new Error(friendlyMsg);
    }

    const data = await res.json();

    // Extract content — handle both regular and reasoning-heavy responses
    const msg = data?.choices?.[0]?.message;
    const content = msg?.content ?? msg?.reasoning_content ?? '';

    if (!content) throw new Error('Sarvam returned an empty response.');

    // Extract the actual text — skip any chain-of-thought reasoning prefix
    return content.trim();
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * callGeminiJSON<T>()
 * Calls Sarvam and extracts the outermost JSON object from the response.
 */
export async function callGeminiJSON<T = Record<string, unknown>>(
    prompt: string,
    options: GeminiModelOptions = {},
): Promise<T> {
    const msgs: ChatMessage[] = [];
    if (options.systemInstruction) {
        msgs.push({ role: 'system', content: options.systemInstruction });
    }
    msgs.push({ role: 'user', content: prompt });

    const raw = await callSarvam(msgs, options);

    // Robust JSON extraction — handles any reasoning text before/after the JSON
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start === -1 || end === -1) {
        throw new Error(`AI did not return valid JSON. Try again.`);
    }

    return JSON.parse(raw.slice(start, end + 1)) as T;
}

/**
 * callGeminiText()
 * Calls Sarvam and returns plain text.
 */
export async function callGeminiText(
    prompt: string,
    options: GeminiModelOptions = {},
): Promise<string> {
    const msgs: ChatMessage[] = [];
    if (options.systemInstruction) {
        msgs.push({ role: 'system', content: options.systemInstruction });
    }
    msgs.push({ role: 'user', content: prompt });
    return callSarvam(msgs, options);
}

/**
 * callGeminiChat()
 * Multi-turn chat with conversation history.
 * History is in Gemini format ({ role, parts }[]) — converted to Sarvam format internally.
 */
export async function callGeminiChat(
    history: GeminiContent[],
    userMessage: string,
    options: GeminiModelOptions = {},
): Promise<string> {
    const msgs: ChatMessage[] = [];

    if (options.systemInstruction) {
        msgs.push({ role: 'system', content: options.systemInstruction });
    }

    // Convert Gemini history format to OpenAI/Sarvam format
    for (const turn of history) {
        const role: 'user' | 'assistant' = turn.role === 'user' ? 'user' : 'assistant';
        msgs.push({ role, content: turn.parts.map((p) => p.text).join('\n') });
    }

    msgs.push({ role: 'user', content: userMessage });

    return callSarvam(msgs, options);
}

/**
 * getGeminiModel()
 * Legacy shim — kept for backward compatibility.
 */
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
