/**
 * app/api/image-analysis/route.ts
 * ─────────────────────────────────
 * POST /api/image-analysis
 *
 * Accepts a base64-encoded image + optional sensor readings,
 * sends both to Gemini Vision, and returns a structured JSON report.
 *
 * Request body (multipart or JSON):
 *   { imageBase64: string, mimeType: string }
 *
 * Response:
 *   {
 *     visualAnalysis: { color, clarity, cloudiness, suspendedParticles,
 *                       foam, oilLayer, algae, rust, sediment, overallVisual },
 *     sensorAnalysis: { ph, tds, turbidity, temperature, gas, wqi, grade },
 *     combinedAssessment: string,
 *     recommendations: string[],
 *     confidence: string,
 *     healthRisk: string,
 *   }
 */

import { NextRequest, NextResponse } from 'next/server';
import { getLatestSensorReading } from '@/services/firebaseReader';

// ── Gemini vision call (direct REST, same pattern as services/gemini.ts) ──────

async function callGeminiVision(
    imageBase64: string,
    mimeType: string,
    sensorText: string,
): Promise<string> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('GEMINI_API_KEY is not configured.');

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${apiKey}`;

    const prompt = `You are AquaVitals AI — an expert water quality analyst with advanced visual inspection capabilities.

Analyze this water sample image in detail.

${sensorText ? `LIVE SENSOR READINGS:\n${sensorText}\n` : 'No live sensor data available.'}

WHO DRINKING WATER STANDARDS:
- pH: 6.5–8.5 | TDS: <300 ppm | Turbidity: <1 NTU | Temperature: 10–25°C

Analyze the image for:
1. Water color (clear, yellow, brown, green, grey, black, etc.)
2. Clarity (crystal clear, slightly cloudy, cloudy, opaque)
3. Cloudiness level (none, mild, moderate, severe)
4. Suspended particles (none, fine, coarse, heavy)
5. Foam (none, minimal, moderate, heavy)
6. Oil layer or sheen (none, slight, visible)
7. Algae (none, trace, visible growth)
8. Rust or metallic discoloration
9. Sediment at bottom
10. Any other visible contamination

IMPORTANT RULES:
- Do NOT diagnose diseases or prescribe medicines
- Use language like "possible health risks associated with these characteristics include..."
- Combine visual findings with sensor data for the combined assessment
- Be specific and practical

Return ONLY valid JSON with this exact structure:
{
  "visualAnalysis": {
    "color": "description of water color",
    "clarity": "clear | slightly cloudy | cloudy | opaque",
    "cloudiness": "none | mild | moderate | severe",
    "suspendedParticles": "none | fine | coarse | heavy",
    "foam": "none | minimal | moderate | heavy",
    "oilLayer": "none | slight | visible",
    "algae": "none | trace | visible growth",
    "rust": "none | slight | significant",
    "sediment": "none | slight | moderate | heavy",
    "overallVisual": "2-3 sentence summary of visual appearance"
  },
  "sensorAnalysis": {
    "ph": "analysis based on sensor value or N/A",
    "tds": "analysis based on sensor value or N/A",
    "turbidity": "analysis based on sensor value or N/A",
    "temperature": "analysis based on sensor value or N/A",
    "gas": "analysis based on sensor value or N/A",
    "wqi": "WQI interpretation or N/A",
    "grade": "grade interpretation or N/A"
  },
  "combinedAssessment": "comprehensive paragraph combining visual and sensor findings",
  "recommendations": [
    "specific recommendation 1",
    "specific recommendation 2",
    "specific recommendation 3"
  ],
  "confidence": "High | Medium | Low",
  "healthRisk": "None | Low | Moderate | High | Critical"
}`;

    const body = {
        contents: [{
            parts: [
                { text: prompt },
                {
                    inline_data: {
                        mime_type: mimeType,
                        data: imageBase64,
                    },
                },
            ],
        }],
        generationConfig: { temperature: 0.1 },
    };

    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });

    if (!res.ok) {
        const err = await res.text();
        if (res.status === 429) throw new Error('AI service is temporarily busy. Please try again.');
        if (res.status === 401) throw new Error('Invalid Gemini API key. Please check your configuration.');
        throw new Error(`AI service error ${res.status}. Please try again.`);
    }

    const data = await res.json();
    return data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
    try {
        const { imageBase64, mimeType } = await req.json();

        if (!imageBase64) {
            return NextResponse.json({ error: 'No image provided.' }, { status: 400 });
        }

        // Validate mime type
        const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
        const safeMime = allowedTypes.includes(mimeType) ? mimeType : 'image/jpeg';

        // ── Fetch latest sensor data (non-blocking, graceful on failure) ─────────
        const reading = await getLatestSensorReading(3000);
        let sensorText = '';

        if (reading) {
            const f = (v: number | undefined, u: string) => v !== undefined ? `${v} ${u}` : 'N/A';
            sensorText = [
                reading.city && reading.country ? `Location: ${reading.city}, ${reading.country}` : null,
                `pH: ${f(reading.ph, '')}`,
                `TDS: ${f(reading.tds, 'ppm')}`,
                `Turbidity: ${f(reading.turbidity, 'NTU')}`,
                `Temperature: ${f(reading.temp, '°C')}`,
                `Gas (ADC): ${f(reading.gas, '')}`,
                `WQI: ${f(reading.wqi, '/ 100')}`,
                `Grade: ${reading.grade ?? 'N/A'}`,
            ].filter(Boolean).join('\n');
        }

        // ── Call Gemini Vision ────────────────────────────────────────────────────
        const rawText = await callGeminiVision(imageBase64, safeMime, sensorText);

        if (!rawText) {
            return NextResponse.json({ error: 'AI returned empty response. Try again.' }, { status: 500 });
        }

        // Robust JSON extraction
        const start = rawText.indexOf('{');
        const end = rawText.lastIndexOf('}');
        if (start === -1 || end === -1) {
            return NextResponse.json({ error: 'AI did not return valid analysis. Try again.' }, { status: 500 });
        }

        const analysis = JSON.parse(rawText.slice(start, end + 1));
        return NextResponse.json(analysis);

    } catch (err) {
        console.error('[AquaVitals] /api/image-analysis error:', err);
        const message = err instanceof Error ? err.message : 'Image analysis failed. Try again.';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
