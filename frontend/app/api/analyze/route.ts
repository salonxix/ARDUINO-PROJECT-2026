import { NextRequest, NextResponse } from 'next/server';
import { callGeminiJSON } from '@/services/gemini';
import { getAdminDb } from '@/lib/firebaseAdmin';

export async function POST(req: NextRequest) {
  try {
    const { ph, tds, temperature, turbidity, gas, firebaseKey, location } = await req.json();

    const phVal = ph ?? 'unknown';
    const tdsVal = tds ?? 'unknown';
    const tempVal = temperature ?? 'unknown';
    const turbVal = turbidity ?? 'unknown';
    const gasVal = gas ?? 'unknown';
    const loc = location ? `Location: ${location}. ` : '';

    // Compute status server-side so model never needs to guess
    const phS = ph !== undefined ? (ph < 6.5 || ph > 8.5 ? (ph < 6.5 ? 'LOW' : 'HIGH') : 'NORMAL') : 'NORMAL';
    const tdsS = tds !== undefined ? (tds > 300 ? 'HIGH' : 'NORMAL') : 'NORMAL';
    const tempS = temperature !== undefined ? (temperature > 25 ? 'HIGH' : temperature < 10 ? 'LOW' : 'NORMAL') : 'NORMAL';
    const turbS = turbidity !== undefined ? (turbidity > 1 ? 'HIGH' : 'NORMAL') : 'NORMAL';
    const gasS = gas !== undefined ? (gas > 150 ? 'HIGH' : 'NORMAL') : 'NORMAL';

    const drinking = tdsS === 'NORMAL' && turbS === 'NORMAL' && phS === 'NORMAL' ? 'Suitable' : 'Suitable after treatment';
    const cooking = tdsS === 'HIGH' ? 'Suitable after treatment' : 'Suitable';
    const bathing = turbS === 'HIGH' ? 'Use with caution' : 'Suitable';
    const irrigation = tdsS === 'HIGH' ? 'Suitable with caution' : 'Suitable';

    const prompt = `You are AquaVitals AI — a water quality expert. Analyze this water sample and write a detailed JSON report.

${loc}Sensor readings: pH ${phVal} (${phS}), TDS ${tdsVal} ppm (${tdsS}), Temperature ${tempVal}°C (${tempS}), Turbidity ${turbVal} NTU (${turbS}), Gas ADC ${gasVal} (${gasS}).
WHO drinking water standards: pH 6.5-8.5, TDS <300 ppm, Temperature 10-25°C, Turbidity <1 NTU, Gas ADC <150.

Write a comprehensive water quality analysis. Every field must contain real, informative content — NOT empty strings, NOT "N/A", NOT placeholder text.

Respond with this JSON (replace every value in quotes with real analysis text):

{
  "sensorAnalysis": {
    "ph": {
      "value": ${ph ?? null},
      "idealRange": "6.5-8.5",
      "status": "${phS}",
      "plainExplanation": "pH ${phVal} means the water is ${phS === 'NORMAL' ? 'within the safe neutral range' : phS === 'LOW' ? 'slightly acidic which can corrode pipes and affect taste' : 'slightly alkaline which may taste bitter'} — write 1-2 sentences explaining this to a non-technical person",
      "analogy": "write a simple everyday comparison to help understand this pH level",
      "healthImpact": "write what drinking water with pH ${phVal} means for health"
    },
    "tds": {
      "value": ${tds ?? null},
      "idealRange": "50-300 ppm",
      "status": "${tdsS}",
      "plainExplanation": "TDS ${tdsVal} ppm means ${tdsS === 'HIGH' ? 'there are more dissolved solids than recommended' : 'the dissolved mineral content is within safe limits'} — write 1-2 sentences",
      "analogy": "write a simple comparison for TDS ${tdsVal} ppm",
      "healthImpact": "write the health implication of drinking water with TDS ${tdsVal} ppm"
    },
    "temperature": {
      "value": ${temperature ?? null},
      "idealRange": "10-25 C",
      "status": "${tempS}",
      "plainExplanation": "Water at ${tempVal}°C is ${tempS === 'HIGH' ? 'warmer than ideal for drinking and may promote bacterial growth' : tempS === 'LOW' ? 'colder than typical drinking water' : 'within the comfortable drinking temperature range'} — write 1-2 sentences",
      "analogy": "write a simple comparison for ${tempVal}°C water temperature",
      "healthImpact": "write what ${tempVal}°C water temperature means for safety"
    },
    "turbidity": {
      "value": ${turbidity ?? null},
      "idealRange": "0-1 NTU",
      "status": "${turbS}",
      "plainExplanation": "Turbidity of ${turbVal} NTU means the water ${turbS === 'HIGH' ? 'appears cloudy and may contain suspended particles or microorganisms' : 'is clear and visually acceptable'} — write 1-2 sentences",
      "analogy": "write a simple comparison for water with turbidity ${turbVal} NTU",
      "healthImpact": "write the health risk of drinking water with turbidity ${turbVal} NTU"
    },
    "gas": {
      "value": ${gas ?? null},
      "idealRange": "ADC<150",
      "status": "${gasS}",
      "plainExplanation": "Gas level ADC ${gasVal} ${gasS === 'HIGH' ? 'indicates elevated dissolved gases which may signal contamination' : 'is within safe limits indicating minimal gas contamination'} — write 1-2 sentences",
      "analogy": "write a simple comparison for gas ADC ${gasVal}",
      "healthImpact": "write what gas level ADC ${gasVal} means for drinking safety"
    }
  },
  "idealRanges": {
    "ph": "6.5-8.5",
    "tds": "50-300 ppm",
    "temperature": "10-25 C",
    "turbidity": "0-1 NTU",
    "gas": "ADC<150"
  },
  "drinkingSuitability": "${drinking}",
  "cookingSuitability": "${cooking}",
  "bathingSuitability": "${bathing}",
  "irrigationSuitability": "${irrigation}",
  "shortTermEffects": {
    "drinking": "describe the immediate effects (within days) of drinking this specific water",
    "cooking": "describe how cooking with this water affects food taste and safety",
    "bathing": "describe immediate skin or eye effects of bathing with this water",
    "irrigation": "describe the immediate effect on plants and soil from this water"
  },
  "longTermEffects": {
    "drinking": "describe health effects after drinking this water for months or years",
    "cooking": "describe long-term food quality impact of using this water regularly",
    "bathing": "describe skin conditions that may develop from long-term bathing with this water",
    "irrigation": "describe soil degradation or crop damage from long-term irrigation with this water"
  },
  "possibleDiseases": [
    "list 2-3 diseases that could result from drinking this water regularly"
  ],
  "possibleSkinDiseases": [
    "list 2 skin conditions that could result from bathing in this water"
  ],
  "waterborneDiseasees": [
    "list 2 waterborne diseases associated with these water characteristics"
  ],
  "issuesDetected": [
    "list the specific water quality problems found in this sample"
  ],
  "healthRisks": [
    "list 2-3 specific health risks associated with this water"
  ],
  "precautions": [
    "list 3 specific precautions the user should take"
  ],
  "suggestedTreatment": {
    "boiling": "explain whether boiling helps and for how long",
    "filtration": "explain which filtration method is best for these readings",
    "reverseOsmosis": "explain whether RO is recommended for TDS ${tdsVal} ppm",
    "chlorination": "explain whether chlorination is needed for turbidity ${turbVal} NTU",
    "uvTreatment": "explain whether UV treatment is recommended"
  },
  "overallSummary": "write 2-3 sentences summarising: (1) overall water quality, (2) the biggest concern given these readings, (3) the single most important action the user should take"
}`;

    const analysis = await callGeminiJSON(prompt, { temperature: 0.4 });

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
