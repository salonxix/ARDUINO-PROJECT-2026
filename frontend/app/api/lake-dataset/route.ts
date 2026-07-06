/**
 * app/api/lake-dataset/route.ts
 * GET /api/lake-dataset
 * Returns all lake summaries (name, coordinates, latest readings) for the map.
 *
 * GET /api/lake-dataset?lake=Hebbal+Lake&history=true
 * Returns the full history for one lake.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebaseAdmin';

export async function GET(req: NextRequest) {
    try {
        const db = getAdminDb();
        const { searchParams } = new URL(req.url);
        const lakeName = searchParams.get('lake');
        const wantHistory = searchParams.get('history') === 'true';

        if (lakeName && wantHistory) {
            // Return full history for one lake
            const key = lakeName.replace(/[.#$[\]/]/g, '_');
            const snap = await db.ref(`lake-dataset/${key}`).once('value');
            if (!snap.exists()) return NextResponse.json({ error: 'Lake not found.' }, { status: 404 });
            return NextResponse.json(snap.val());
        }

        // Return all lake summaries (name + coordinates + latest only — no history)
        const snap = await db.ref('lake-dataset').once('value');
        if (!snap.exists()) return NextResponse.json([]);

        const raw = snap.val() as Record<string, {
            name?: string;
            coordinates?: { latitude: number; longitude: number };
            latest?: Record<string, unknown>;
        }>;

        // Only return lakes that have coordinates
        const lakes = Object.entries(raw)
            .filter(([, v]) => v?.coordinates?.latitude && v?.coordinates?.longitude)
            .map(([, v]) => ({
                name: v.name,
                coordinates: v.coordinates,
                latest: v.latest ?? null,
            }));

        return NextResponse.json(lakes);
    } catch (err) {
        console.error('[AquaVitals] /api/lake-dataset error:', err);
        return NextResponse.json({ error: 'Failed to fetch lake data.' }, { status: 500 });
    }
}
