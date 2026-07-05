/**
 * app/api/image-analysis/route.ts
 * ─────────────────────────────────
 * POST /api/image-analysis
 *
 * Vision provider: OpenRouter (google/gemini-2.5-flash)
 * All other AI routes use Sarvam — this is the ONLY route using OpenRouter.
 *
 * Environment variables read:
 *   OPENROUTER_API_KEY  — required
 *   OPENROUTER_MODEL    — optional, defaults to 'google/gemini-2.5-flash'
 *
 * Request body:   { imageBase64: string, mimeType: string }
 * Response body:  ImageAnalysisResponse (see type below)
 *
 * The frontend (VisualWaterInspector.tsx) is unchanged — same request and
 * response contract as before.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getLatestSensorReading } from '@/services/firebaseReader';

// ── Types ─────────────────────────────────────────────────────────────────────

/** Exact response schema returned to the frontend */
interface ImageAnalysisResponse {
  overallCondition: string;
  contaminationLevel: 'Low' | 'Moderate' | 'High' | 'Severe';
  confidence: string;
  visiblePollutants: string[];
  observations: string[];
  possibleSources: string[];
  healthRisks: string[];
  recommendedTests: string[];
  recommendedTreatment: string[];
  whoAssessment: string;
  summary: string;
  // Legacy / optional fields kept for backward-compat with VisualWaterInspector
  visualAnalysis?: {
    clarity?: string;
    colour?: string;
    algae?: string;
    foam?: string;
    oilLayer?: string;
    sediment?: string;
    visibleContamination?: string;
  };
  recommendations?: string[];
}

// ── Constants ─────────────────────────────────────────────────────────────────

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const DEFAULT_MODEL = 'google/gemini-2.5-flash';
const SITE_URL = 'http://localhost:3000';
const SITE_TITLE = 'AquaVitals AI';
const ALLOWED_MIMETYPES = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic',
]);

// ── Helper: map HTTP status to user-friendly error message ────────────────────

function friendlyError(status: number, body: string): string {
  if (status === 401) return 'Invalid OpenRouter API Key. Please check OPENROUTER_API_KEY in .env.local';
  if (status === 429) return 'OpenRouter rate limit exceeded. Please try again shortly.';
  if (status === 503) return 'Vision service temporarily unavailable. Please try again.';
  if (status >= 500) return 'Unable to analyse image right now. Please try again later.';
  // Try to extract a message from the OpenRouter error body
  try {
    const parsed = JSON.parse(body);
    return parsed?.error?.message ?? `Vision API error ${status}.`;
  } catch {
    return `Vision API error ${status}. Please try again.`;
  }
}

// ── Helper: call OpenRouter Vision API ────────────────────────────────────────

async function callOpenRouterVision(
  imageBase64: string,
  mimeType: string,
  sensorText: string,
): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  const model = process.env.OPENROUTER_MODEL ?? DEFAULT_MODEL;

  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY is not configured. Add it to .env.local — get a key from https://openrouter.ai/keys');
  }

  const systemPrompt = `You are AquaVitals AI.
You are an environmental scientist, WHO water-quality expert, and water pollution analyst.
Analyse the uploaded water image carefully.
Never invent facts. If something cannot be confirmed visually, clearly state it cannot be confirmed.
Use WHO drinking-water standards wherever relevant.
Provide practical recommendations.
Return ONLY valid JSON — no markdown, no code fences, no extra text.`;

  const userPrompt = `Analyse this uploaded water sample image.
${sensorText ? `\nLIVE SENSOR CONTEXT:\n${sensorText}\n` : ''}
Return JSON in exactly this format:
{
  "overallCondition": "one sentence describing the water condition",
  "contaminationLevel": "Low | Moderate | High | Severe",
  "confidence": "percentage 0-100 as string e.g. 85",
  "visiblePollutants": ["only things actually visible in the image"],
  "observations": ["colour", "clarity", "floating particles", "foam", "algae", "oil", "plastics", "sediment"],
  "possibleSources": ["Industrial | Domestic | Agricultural | Natural runoff | Construction | Unknown"],
  "healthRisks": ["only probable risks based on visual evidence"],
  "recommendedTests": ["pH", "TDS", "Turbidity", "Lead", "Arsenic", "Nitrate", "Coliform", "Heavy Metals", "DO", "BOD", "COD"],
  "recommendedTreatment": ["RO", "UV", "UF", "Activated Carbon", "Boiling", "Sedimentation"],
  "whoAssessment": "how this compares to WHO drinking water standards",
  "summary": "plain language explanation for a non-technical user"
}

Rules:
- visiblePollutants: only include what is actually visible in the image
- observations: describe what you see — do not guess or invent
- possibleSources: list only plausible sources given what is visible
- healthRisks: only include probable risks, do not over-alarm
- confidence: a number as a string reflecting certainty from 0 to 100`;

  const requestBody = {
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: [
          { type: 'text', text: userPrompt },
          {
            type: 'image_url',
            image_url: {
              url: `data:${mimeType};base64,${imageBase64}`,
              detail: 'high',
            },
          },
        ],
      },
    ],
    temperature: 0.1,
  };

  const res = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'HTTP-Referer': SITE_URL,
      'X-Title': SITE_TITLE,
    },
    body: JSON.stringify(requestBody),
  });

  if (!res.ok) {
    const errBody = await res.text();
    console.error('[AquaVitals] OpenRouter error:', res.status, errBody.slice(0, 300));
    throw new Error(friendlyError(res.status, errBody));
  }

  const data = await res.json();
  return data?.choices?.[0]?.message?.content ?? '';
}

// ── Helper: extract and validate JSON from AI response ────────────────────────

function extractJson(raw: string): ImageAnalysisResponse {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');

  if (start === -1 || end === -1 || end <= start) {
    throw new Error('AI did not return valid JSON. Please try again.');
  }

  const parsed = JSON.parse(raw.slice(start, end + 1)) as Partial<ImageAnalysisResponse>;

  // Guarantee all required fields exist — fill with safe defaults if missing
  return {
    overallCondition: parsed.overallCondition ?? 'Unable to determine.',
    contaminationLevel: (['Low', 'Moderate', 'High', 'Severe'].includes(parsed.contaminationLevel ?? '')
      ? parsed.contaminationLevel! : 'Moderate'),
    confidence: String(parsed.confidence ?? '0'),
    visiblePollutants: Array.isArray(parsed.visiblePollutants) ? parsed.visiblePollutants : [],
    observations: Array.isArray(parsed.observations) ? parsed.observations : [],
    possibleSources: Array.isArray(parsed.possibleSources) ? parsed.possibleSources : [],
    healthRisks: Array.isArray(parsed.healthRisks) ? parsed.healthRisks : [],
    recommendedTests: Array.isArray(parsed.recommendedTests) ? parsed.recommendedTests : [],
    recommendedTreatment: Array.isArray(parsed.recommendedTreatment) ? parsed.recommendedTreatment : [],
    whoAssessment: parsed.whoAssessment ?? '',
    summary: parsed.summary ?? '',
    // Bridge to legacy VisualWaterInspector fields
    visualAnalysis: {
      colour: parsed.observations?.[0] ?? '',
      clarity: parsed.observations?.[1] ?? '',
      visibleContamination: (parsed.visiblePollutants ?? []).join(', ') || 'none detected',
      sediment: '',
      foam: '',
      oilLayer: '',
      algae: '',
    },
    recommendations: parsed.recommendedTreatment ?? [],
  };
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const { imageBase64, mimeType } = await req.json();

    if (!imageBase64) {
      return NextResponse.json({ error: 'No image provided.' }, { status: 400 });
    }

    // Sanitise mime type
    const safeMime = ALLOWED_MIMETYPES.has(mimeType) ? mimeType : 'image/jpeg';

    // ── Fetch latest sensor data from Firebase (non-blocking) ─────────────
    const reading = await getLatestSensorReading(3000);
    let sensorText = '';

    if (reading) {
      const f = (v: number | undefined, u: string) =>
        v !== undefined ? `${v} ${u}`.trim() : 'N/A';
      sensorText = [
        reading.city && reading.country
          ? `Location: ${reading.city}, ${reading.country}` : null,
        `pH: ${f(reading.ph, '')}`,
        `TDS: ${f(reading.tds, 'ppm')}`,
        `Turbidity: ${f(reading.turbidity, 'NTU')}`,
        `Temperature: ${f(reading.temp, '°C')}`,
        `Gas (ADC): ${f(reading.gas, '')}`,
        `WQI: ${f(reading.wqi, '/ 100')}`,
        `Grade: ${reading.grade ?? 'N/A'}`,
      ].filter(Boolean).join('\n');
    }

    // ── Call OpenRouter Vision ────────────────────────────────────────────
    const rawText = await callOpenRouterVision(imageBase64, safeMime, sensorText);

    if (!rawText) {
      return NextResponse.json(
        { error: 'OpenRouter returned an empty response. Please try again.' },
        { status: 500 },
      );
    }

    // ── Validate + normalise JSON ─────────────────────────────────────────
    const analysis = extractJson(rawText);
    return NextResponse.json(analysis);

  } catch (err) {
    console.error('[AquaVitals] /api/image-analysis error:', err);
    const message = err instanceof Error ? err.message : 'Image analysis failed. Try again.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
