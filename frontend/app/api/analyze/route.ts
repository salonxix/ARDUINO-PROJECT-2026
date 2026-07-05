import { NextRequest, NextResponse } from 'next/server';
import { callGeminiJSON } from '@/services/gemini';
import { getAdminDb } from '@/lib/firebaseAdmin';

export async function POST(req: NextRequest) {
  try {
    const { ph, tds, temperature, turbidity, gas, firebaseKey, location } = await req.json();

    const prompt = `You are AquaVitals AI, a water quality expert. Analyze these sensor readings.

${location ? `Location: ${location}` : ''}
pH: ${ph ?? 'N/A'}, TDS: ${tds ?? 'N/A'} ppm, Temperature: ${temperature ?? 'N/A'} C, Turbidity: ${turbidity ?? 'N/A'} NTU, Gas: ${gas ?? 'N/A'} ADC

WHO standards: pH 6.5-8.5, TDS <300ppm, Temp 10-25C, Turbidity <1 NTU, Gas ADC<150.

Return a JSON object with this exact structure (fill every field with real analysis):
{
  "sensorAnalysis": {
    "ph": { "value": ${ph ?? null}, "idealRange": "6.5-8.5", "status": "LOW|NORMAL|HIGH", "plainExplanation": "...", "analogy": "...", "healthImpact": "..." },
    "tds": { "value": ${tds ?? null}, "idealRange": "50-300 ppm", "status": "LOW|NORMAL|HIGH", "plainExplanation": "...", "analogy": "...", "healthImpact": "..." },
    "temperature": { "value": ${temperature ?? null}, "idealRange": "10-25 C", "status": "LOW|NORMAL|HIGH", "plainExplanation": "...", "analogy": "...", "healthImpact": "..." },
    "turbidity": { "value": ${turbidity ?? null}, "idealRange": "0-1 NTU", "status": "LOW|NORMAL|HIGH", "plainExplanation": "...", "analogy": "...", "healthImpact": "..." },
    "gas": { "value": ${gas ?? null}, "idealRange": "ADC<150", "status": "LOW|NORMAL|HIGH", "plainExplanation": "...", "analogy": "...", "healthImpact": "..." }
  },
  "idealRanges": { "ph": "6.5-8.5", "tds": "50-300 ppm", "temperature": "10-25 C", "turbidity": "0-1 NTU", "gas": "ADC<150" },
  "drinkingSuitability": "Suitable | Not Suitable | Suitable after treatment",
  "cookingSuitability": "Suitable | Not Suitable | Suitable after treatment",
  "bathingSuitability": "Suitable | Not Suitable | Use with caution",
  "irrigationSuitability": "Suitable | Not Suitable | Suitable with caution",
  "shortTermEffects": { "drinking": "...", "cooking": "...", "bathing": "...", "irrigation": "..." },
  "longTermEffects": { "drinking": "...", "cooking": "...", "bathing": "...", "irrigation": "..." },
  "possibleDiseases": ["...", "..."],
  "possibleSkinDiseases": ["...", "..."],
  "waterborneDiseasees": ["...", "..."],
  "issuesDetected": ["...", "..."],
  "healthRisks": ["...", "..."],
  "precautions": ["...", "...", "..."],
  "suggestedTreatment": {
    "boiling": "...",
    "filtration": "...",
    "reverseOsmosis": "...",
    "chlorination": "...",
    "uvTreatment": "..."
  },
  "overallSummary": "2-3 sentences summarising water quality, biggest concern, and top recommendation."
}`;

    const analysis = await callGeminiJSON(prompt, { temperature: 0.1 });

    // ── Save to Firebase ──────────────────────────────────────────────────────
    if (firebaseKey) {
      const db = getAdminDb();
      await db.ref(`water-data/${firebaseKey}/analysis`).set({
        ...analysis,
        analyzedAt: Date.now(),
      });
    }

    return NextResponse.json(analysis);
  } catch (err) {
    console.error('[AquaVitals] /api/analyze error:', err);
    const message = err instanceof Error ? err.message : 'Analysis failed. Please try again.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
