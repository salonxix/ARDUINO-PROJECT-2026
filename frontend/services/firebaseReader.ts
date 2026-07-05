/**
 * services/firebaseReader.ts
 * ──────────────────────────
 * Shared Firebase read helpers used by API routes.
 *
 * Centralises the pattern of reading from Firebase Realtime Database
 * with a timeout guard and silent error handling, so multiple routes
 * don't duplicate this logic.
 *
 * Exported functions:
 *   getLatestSensorReading()  — returns the newest entry from water-data
 */

import { getAdminDb } from '@/lib/firebaseAdmin';

// ── Types ─────────────────────────────────────────────────────────────────────

/**
 * SensorReading
 * ─────────────
 * Shape of a single entry stored in Firebase under water-data/{pushKey}.
 * All fields are optional because older entries may lack some fields.
 */
export interface SensorReading {
    ph?: number;
    tds?: number;
    turbidity?: number;
    temp?: number;    // stored as 'temp' in Firebase (not 'temperature')
    gas?: number;
    wqi?: number;
    grade?: string;
    city?: string;
    country?: string;
    lat?: number;
    lng?: number;
    timestamp?: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * getLatestSensorReading()
 * ────────────────────────
 * Fetches the single most-recent entry from the Firebase Realtime
 * Database node "water-data", ordered by the timestamp field.
 *
 * Includes a configurable timeout so the caller is never blocked
 * indefinitely if Firebase is unreachable.
 *
 * Returns null (never throws) if:
 *   - Firebase is unreachable
 *   - The node is empty
 *   - The read exceeds the timeout
 *   - Any unexpected error occurs
 *
 * @param timeoutMs - Max milliseconds to wait (default: 4000)
 * @returns         - Latest SensorReading or null
 */
export async function getLatestSensorReading(
    timeoutMs = 4000,
): Promise<SensorReading | null> {
    try {
        const db = getAdminDb();

        return await Promise.race([
            // ── Firebase read ───────────────────────────────────────────────────────
            new Promise<SensorReading | null>((resolve) => {
                db.ref('water-data')
                    .orderByChild('timestamp')
                    .limitToLast(1)
                    .once(
                        'value',
                        (snapshot) => {
                            if (!snapshot.exists()) { resolve(null); return; }

                            // limitToLast(1) returns an object keyed by push ID
                            // — extract the single value
                            const raw = snapshot.val() as Record<string, SensorReading>;
                            const latest = Object.values(raw)[0] ?? null;
                            resolve(latest);
                        },
                        // Firebase read error callback → resolve null, don't reject
                        () => resolve(null),
                    );
            }),

            // ── Timeout guard ───────────────────────────────────────────────────────
            new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
        ]);
    } catch {
        // Catch anything that slips through (e.g. getAdminDb() throwing)
        return null;
    }
}

/**
 * formatSensorForPrompt()
 * ────────────────────────
 * Converts a SensorReading into a compact, human-readable string
 * suitable for embedding in a Gemini prompt.
 *
 * @param reading  - The sensor reading to format
 * @returns        - Multi-line formatted string
 */
export function formatSensorForPrompt(reading: SensorReading): string {
    const f = (v: number | undefined, unit: string) =>
        v !== undefined ? `${v} ${unit}`.trim() : 'N/A';

    const location =
        reading.city && reading.country ? `${reading.city}, ${reading.country}` :
            reading.city ?? reading.country ?? null;

    const ts = reading.timestamp
        ? new Date(reading.timestamp).toLocaleString()
        : 'recently';

    return [
        location ? `Location  : ${location}` : null,
        `Recorded  : ${ts}`,
        `pH        : ${f(reading.ph, '')}`,
        `TDS       : ${f(reading.tds, 'ppm')}`,
        `Turbidity : ${f(reading.turbidity, 'NTU')}`,
        `Temp      : ${f(reading.temp, '°C')}`,
        `Gas (ADC) : ${f(reading.gas, '')}`,
        `WQI       : ${f(reading.wqi, '/ 100')}`,
        `Grade     : ${reading.grade ?? 'N/A'}`,
    ]
        .filter(Boolean)
        .join('\n');
}
