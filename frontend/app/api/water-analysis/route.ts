/**
 * app/api/water-analysis/route.ts
 * ─────────────────────────────────
 * POST /api/water-analysis
 *
 * Reads the latest sensor values from Firebase, then calls the same
 * Gemini service used by /api/analyze — keeping both endpoints consistent.
 *
 * The only difference from /api/analyze is that sensor values come from
 * Firebase (server-side read) instead of the request body.
 */

import { NextResponse } from 'next/server';
import { callGeminiJSON } from '@/services/gemini';
import { getLatestSensorReading } from '@/services/firebaseReader';

export interface WaterAnalysisResponse {
    summary: string;
    pros: string[];
    cons: string[];
    parameters: {
        ph: string;
        tds: string;
        turbidity: string;
        temperature: string;
        gas: string;
    };
    whoComparison: string;
    healthRisks: string[];
    recommendations: string[];
    filtration: string;
    simpleExplanation: string;
}

export async function POST() {
    // ── 1. Read latest sensor values from Firebase ────────────────────────────
    const reading = await getLatestSensorReading(4000);

    if (!reading) {
        return NextResponse.json(
            { error: 'No sensor data available. Send a reading to Firebase first.' },
            { status: 404 },
        );
    }

    const { ph, tds, turbidity, temp: temperature, gas } = reading;
    const location = reading.city && reading.country
        ? `${reading.city}, ${reading.country}`
        : reading.city ?? reading.country ?? null;

    // ── 2. Build prompt — same compact format as /api/analyze ─────────────────
    const prompt = `You are AquaVitals AI, a water quality expert. Analyze these sensor readings.

${location ? `Location: ${location}` : ''}
pH: ${ph ?? 'N/A'}, TDS: ${tds ?? 'N/A'} ppm, Temperature: ${temperature ?? 'N/A'} C, Turbidity: ${turbidity ?? 'N/A'} NTU, Gas: ${gas ?? 'N/A'} ADC

WHO standards: pH 6.5-8.5, TDS <300ppm, Temp 10-25C, Turbidity <1 NTU, Gas ADC<150.

Return ONLY a valid JSON object with this exact structure:
{
  "summary": "2-3 sentences summarising overall water quality and the single most important action",
  "pros": ["positive aspect 1", "positive aspect 2"],
  "cons": ["issue or concern 1", "issue or concern 2"],
  "parameters": {
    "ph": "plain-English analysis of pH",
    "tds": "plain-English analysis of TDS",
    "turbidity": "plain-English analysis of turbidity",
    "temperature": "plain-English analysis of temperature",
    "gas": "plain-English analysis of gas level"
  },
  "whoComparison": "paragraph comparing each sensor value to WHO standards",
  "healthRisks": ["Possible health risk 1", "Possible health risk 2"],
  "recommendations": ["preventive measure 1", "preventive measure 2", "preventive measure 3"],
  "filtration": "best filtration method for these readings with brief explanation",
  "simpleExplanation": "3-4 sentence plain-English explanation for a non-technical user"
}`;

    // ── 3. Call Gemini — same service as /api/analyze ────────────────────────
    try {
        const analysis = await callGeminiJSON<WaterAnalysisResponse>(prompt, {
            temperature: 0.1,
        });
        return NextResponse.json(analysis);
    } catch (err) {
        console.error('[AquaVitals] /api/water-analysis error:', err);
        const message = err instanceof Error ? err.message : 'AI analysis failed. Please try again.';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
