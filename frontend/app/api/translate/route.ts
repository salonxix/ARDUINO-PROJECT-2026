/**
 * app/api/translate/route.ts
 * POST /api/translate
 *
 * Translates a WaterAnalysis JSON object from English into the target language.
 * The analysis structure is preserved — only the text content is translated.
 * Technical terms (pH, TDS, WQI, WHO, RO, UV) remain in English.
 *
 * Request body:
 *   { analysis: WaterAnalysis, language: 'kannada' | 'hindi' }
 *
 * Response: translated WaterAnalysis JSON
 */

import { NextRequest, NextResponse } from 'next/server';
import { callGeminiJSON } from '@/services/gemini';

export async function POST(req: NextRequest) {
    try {
        const { analysis, language } = await req.json();

        if (!analysis) return NextResponse.json({ error: 'No analysis provided.' }, { status: 400 });
        if (language === 'english') return NextResponse.json(analysis);   // nothing to translate

        const targetLang = language === 'kannada'
            ? 'Kannada (ಕನ್ನಡ)'
            : 'Hindi (हिन्दी)';

        const prompt = `Translate the following water quality analysis JSON from English into ${targetLang}.

RULES:
1. Keep ALL JSON keys exactly as they are — translate ONLY the string VALUES.
2. Keep these technical terms in English unchanged: pH, TDS, WQI, WHO, RO, UV, NTU, ppm, ADC.
3. Use natural conversational ${targetLang} — NOT word-for-word translation.
4. Array items must remain as arrays with the same number of items.
5. Return ONLY valid JSON — no markdown, no code fences, no extra text.

Input JSON:
${JSON.stringify(analysis, null, 2)}

Return the fully translated JSON object:`;

        const translated = await callGeminiJSON(prompt, { temperature: 0.1 });
        return NextResponse.json(translated);

    } catch (err) {
        console.error('[AquaVitals] /api/translate error:', err);
        const message = err instanceof Error ? err.message : 'Translation failed.';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
