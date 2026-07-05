/**
 * app/api/image-analysis/route.ts
 * ─────────────────────────────────
 * POST /api/image-analysis
 *
 * Uses Gemini Vision (gemini-2.5-flash-lite) exclusively.
 * Does NOT use services/gemini.ts — that is Sarvam.
 * Reads: GEMINI_API_KEY from .env.local
 */

import { NextRequest, NextResponse } from 'next/server';
import { getLatestSensorReading } from '@/services/firebaseReader';

async function callGeminiVision(imageBase64: string, mimeType: string, sensorText: string): Promise<string> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('GEMINI_API_KEY is not configured. Add a valid AIzaSy... key to .env.local');

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${apiKey}`;

    const prompt = `You are AquaVitals AI — an expert water quality analyst.

Carefully examine this water sample image and identify visible quality indicators.

${sensorText ? `LIVE SENSOR CONTEXT:\n${sensorText}\n` : ''}
WHO standards: pH 6.5–8.5 | TDS <300 ppm | Turbidity <1 NTU | Temperature 10–25°C

Analyse the image for: colour, clarity, foam, oil layer, algae, sediment, suspended particles, and any visible contamination.

RULES:
- Base analysis ONLY on what is visible in the image
- Do NOT diagnose diseases or prescribe medicines
- Use "possible health risks include..." for health concerns

Return ONLY valid JSON — no markdown, no code fences:
{
  "visualAnalysis": {
    "colour": "colour description from the image",
    "clarity": "clear | slightly cloudy | cloudy | opaque",
    "foam": "none | minimal | moderate | heavy",
    "oilLayer": "none | slight sheen | visible film",
    "algae": "none | trace | visible growth",
    "sediment": "none | slight | moderate | heavy",
    "suspendedParticles": "none | fine | coarse | heavy",
    "visibleContamination": "description or none detected"
  },
  "summary": "3-4 sentence plain English summary of the visual water quality",
  "confidence": "High | Medium | Low",
  "recommendations": [
    "recommendation 1 based on visual findings",
    "recommendation 2",
    "recommendation 3"
  ]
}`;

    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{
                parts: [
                    { text: prompt },
                    { inline_data: { mime_type: mimeType, data: imageBase64 } },
                ],
            }],
            generationConfig: { temperature: 0.1 },
        }),
    });

    if (!res.ok) {
        if (res.status === 429) throw new Error('Gemini Vision quota exceeded. Please wait and try again.');
        if (res.status === 401) throw new Error('Invalid GEMINI_API_KEY. Please add a valid AIzaSy... key to .env.local from https://aistudio.google.com/app/apikey');
        if (res.status === 400) throw new Error('Invalid image format. Please try a different image.');
        if (res.status === 503) throw new Error('Gemini Vision is temporarily busy. Please try again.');
        throw new Error(`Gemini Vision error ${res.status}. Please try again.`);
    }

    const data = await res.json();
    return data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
}

export async function POST(req: NextRequest) {
    try {
        const { imageBase64, mimeType } = await req.json();
        if (!imageBase64) return NextResponse.json({ error: 'No image provided.' }, { status: 400 });

        const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic'];
        const safeMime = allowedTypes.includes(mimeType) ? mimeType : 'image/jpeg';

        // Fetch sensor context (non-blocking)
        const reading = await getLatestSensorReading(3000);
        let sensorText = '';
        if (reading) {
            const f = (v: number | undefined, u: string) => v !== undefined ? `${v} ${u}`.trim() : 'N/A';
            sensorText = [
                reading.city && reading.country ? `Location: ${reading.city}, ${reading.country}` : null,
                `pH: ${f(reading.ph, '')}`,
                `TDS: ${f(reading.tds, 'ppm')}`,
                `Turbidity: ${f(reading.turbidity, 'NTU')}`,
                `Temperature: ${f(reading.temp, '°C')}`,
                `Gas ADC: ${f(reading.gas, '')}`,
                `WQI: ${f(reading.wqi, '/ 100')}`,
                `Grade: ${reading.grade ?? 'N/A'}`,
            ].filter(Boolean).join('\n');
        }

        const rawText = await callGeminiVision(imageBase64, safeMime, sensorText);
        if (!rawText) return NextResponse.json({ error: 'Gemini Vision returned an empty response. Try again.' }, { status: 500 });

        const start = rawText.indexOf('{');
        const end = rawText.lastIndexOf('}');
        if (start === -1 || end === -1) return NextResponse.json({ error: 'Could not parse AI response. Try again.' }, { status: 500 });

        return NextResponse.json(JSON.parse(rawText.slice(start, end + 1)));

    } catch (err) {
        console.error('[AquaVitals] /api/image-analysis error:', err);
        return NextResponse.json({ error: err instanceof Error ? err.message : 'Image analysis failed. Try again.' }, { status: 500 });
    }
}
