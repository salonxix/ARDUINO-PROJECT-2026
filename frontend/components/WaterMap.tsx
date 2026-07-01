'use client';

import { useEffect, useState, useMemo } from 'react';
import { ref, onValue } from 'firebase/database';
import { database } from '@/lib/firebase';
import dynamic from 'next/dynamic';

// Dynamically import map to avoid SSR issues with Leaflet
const MapWithNoSSR = dynamic(() => import('./MapInner'), { ssr: false });

export interface WaterSample {
    key: string;
    city: string;
    country: string;
    lat: number;
    lng: number;
    ph?: number;
    tds?: number;
    temp?: number;
    turbidity?: number;
    gas?: number;
    wqi?: number;
    grade?: string;
    timestamp?: number;
}

export default function WaterMap() {
    const [samples, setSamples] = useState<WaterSample[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');

    useEffect(() => {
        const waterRef = ref(database, 'water-data');

        const unsubscribe = onValue(waterRef, (snapshot) => {
            if (snapshot.exists()) {
                const raw = snapshot.val() as Record<string, Omit<WaterSample, 'key'>>;
                const list: WaterSample[] = Object.entries(raw)
                    .filter(([, v]) => v.lat !== undefined && v.lng !== undefined)
                    .map(([key, v]) => ({ key, ...v }));
                setSamples(list);
            } else {
                setSamples([]);
            }
            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return samples;
        return samples.filter((s) =>
            (s.city ?? '').toLowerCase().includes(q)
        );
    }, [samples, search]);

    return (
        <section className="max-w-5xl mx-auto mt-12">
            {/* Section header */}
            <div className="flex items-center gap-3 mb-6">
                <div className="w-9 h-9 rounded-full bg-blue-500/20 border border-blue-500/30 flex items-center justify-center text-lg">
                    🌍
                </div>
                <div>
                    <h2 className="text-xl font-semibold text-white">Global Water Map</h2>
                    <p className="text-xs text-gray-500 mt-0.5">
                        Click a marker to view sensor details
                    </p>
                </div>
                <span className="ml-auto text-xs px-3 py-1 rounded-full bg-white/5 border border-white/10 text-gray-400">
                    {filtered.length}{search ? ` of ${samples.length}` : ''} location{filtered.length !== 1 ? 's' : ''}
                </span>
            </div>

            {/* Search bar */}
            <div className="relative mb-4">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm pointer-events-none">
                    🔍
                </span>
                <input
                    type="text"
                    placeholder="Search by city name…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    suppressHydrationWarning
                    className="
                        w-full pl-9 pr-10 py-2.5 rounded-xl
                        bg-white/5 border border-white/10
                        text-sm text-gray-200 placeholder-gray-600
                        focus:outline-none focus:border-blue-500/50 focus:bg-white/8
                        transition-all duration-200
                    "
                />
                {search && (
                    <button
                        onClick={() => setSearch('')}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 text-xl leading-none transition-colors"
                        aria-label="Clear search"
                    >
                        ×
                    </button>
                )}
            </div>

            {/* Map container */}
            <div className="rounded-2xl overflow-hidden border border-white/10 shadow-xl" style={{ height: '480px' }}>
                {loading ? (
                    <div className="w-full h-full bg-white/5 animate-pulse flex items-center justify-center text-gray-600 text-sm">
                        Loading map…
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="w-full h-full bg-white/5 flex items-center justify-center text-gray-600 text-sm">
                        No cities match &ldquo;{search}&rdquo;
                    </div>
                ) : (
                    <MapWithNoSSR samples={filtered} />
                )}
            </div>

            {/* Legend */}
            <div className="flex flex-wrap gap-4 mt-4 justify-end">
                {[
                    { color: '#22c55e', label: 'Grade A — Excellent' },
                    { color: '#eab308', label: 'Grade B/C — Good' },
                    { color: '#ef4444', label: 'Grade D/F — Poor' },
                ].map(({ color, label }) => (
                    <div key={label} className="flex items-center gap-2">
                        <span
                            className="w-3 h-3 rounded-full border border-white/20"
                            style={{ backgroundColor: color }}
                        />
                        <span className="text-xs text-gray-500">{label}</span>
                    </div>
                ))}
            </div>
        </section>
    );
}
