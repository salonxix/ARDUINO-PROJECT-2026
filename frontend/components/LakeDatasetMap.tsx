'use client';

import { useEffect, useState, useCallback } from 'react';
import dynamic from 'next/dynamic';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface LakeSummary {
    name: string;
    coordinates: { latitude: number; longitude: number };
    latest: Record<string, unknown> | null;
}

// Lazy-load the actual map to avoid SSR issues with Leaflet
const LakeMapInner = dynamic(() => import('./LakeMapInner'), { ssr: false });

// ── Main component ────────────────────────────────────────────────────────────

export default function LakeDatasetMap() {
    const [lakes, setLakes] = useState<LakeSummary[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchLakes = useCallback(async () => {
        setLoading(true); setError(null);
        try {
            const res = await fetch('/api/lake-dataset');
            const data = await res.json();
            if (!res.ok || data.error) throw new Error(data.error ?? 'Failed to load lakes.');
            setLakes(data as LakeSummary[]);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load lake data.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchLakes(); }, [fetchLakes]);

    return (
        <section className="max-w-5xl mx-auto mt-12" id="lake-dataset-map">
            <div className="flex items-center gap-3 mb-6">
                <div className="w-9 h-9 rounded-full bg-blue-500/20 border border-blue-500/30 flex items-center justify-center text-lg">🏞️</div>
                <div>
                    <h2 className="text-xl font-semibold text-white">KSPCB Historical Lake Data</h2>
                    <p className="text-xs text-gray-500 mt-0.5">
                        {loading ? 'Loading lake data…' : `${lakes.length} lakes with historical water quality records`}
                    </p>
                </div>
            </div>

            <div className="rounded-2xl overflow-hidden border border-white/10 shadow-xl" style={{ height: 500 }}>
                {loading && (
                    <div className="w-full h-full bg-white/5 flex items-center justify-center text-gray-600 text-sm animate-pulse">
                        Loading lake dataset…
                    </div>
                )}
                {error && (
                    <div className="w-full h-full bg-white/5 flex flex-col items-center justify-center gap-3 text-center px-6">
                        <span className="text-3xl">⚠️</span>
                        <p className="text-gray-400 text-sm">{error}</p>
                        <button onClick={fetchLakes}
                            className="text-xs px-4 py-2 rounded-lg border border-blue-500/35 text-blue-400 hover:bg-blue-500/10 cursor-pointer transition-all">
                            Retry
                        </button>
                    </div>
                )}
                {!loading && !error && <LakeMapInner lakes={lakes} />}
            </div>

            {/* Legend */}
            <div className="flex flex-wrap gap-4 mt-4 justify-end text-xs text-gray-500">
                <div className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-full bg-green-400 border border-white/20" />Good quality (DO ≥ 5)
                </div>
                <div className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-full bg-yellow-400 border border-white/20" />Moderate (DO 3–5)
                </div>
                <div className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-full bg-red-400 border border-white/20" />Poor (DO &lt; 3)
                </div>
                <div className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-full bg-gray-400 border border-white/20" />No data
                </div>
            </div>
        </section>
    );
}
