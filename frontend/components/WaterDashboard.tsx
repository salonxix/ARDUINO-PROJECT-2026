'use client';

import { useEffect, useState } from 'react';
import { ref, onValue, query, limitToLast } from 'firebase/database';
import { database } from '@/lib/firebase';

interface WaterData {
    ph?: number;
    tds?: number;
    temp?: number;
    grade?: string;
    city?: string;
    wqi?: number;
}

interface Metric {
    label: string;
    value: string;
    unit: string;
    icon: string;
    description: string;
    color: string;
    border: string;
    glow: string;
}

/** Derive WQI card colours based on score */
function wqiStyle(wqi: number | undefined): {
    color: string;
    border: string;
    glow: string;
    badge: string;
    badgeText: string;
    label: string;
} {
    if (wqi === undefined) {
        return {
            color: 'from-gray-500/20 to-gray-600/20',
            border: 'border-gray-500/30',
            glow: 'hover:shadow-gray-500/20',
            badge: 'bg-gray-500/20 text-gray-300',
            badgeText: '--',
            label: 'No data',
        };
    }
    if (wqi >= 85) {
        return {
            color: 'from-green-500/20 to-emerald-500/20',
            border: 'border-green-500/30',
            glow: 'hover:shadow-green-500/20',
            badge: 'bg-green-500/20 text-green-300',
            badgeText: 'Excellent',
            label: 'Excellent quality',
        };
    }
    if (wqi >= 70) {
        return {
            color: 'from-yellow-500/20 to-amber-500/20',
            border: 'border-yellow-500/30',
            glow: 'hover:shadow-yellow-500/20',
            badge: 'bg-yellow-500/20 text-yellow-300',
            badgeText: 'Good',
            label: 'Good quality',
        };
    }
    // below 55 → red (covers 55–70 as "Fair" in amber, <55 as red)
    if (wqi >= 55) {
        return {
            color: 'from-orange-500/20 to-amber-600/20',
            border: 'border-orange-500/30',
            glow: 'hover:shadow-orange-500/20',
            badge: 'bg-orange-500/20 text-orange-300',
            badgeText: 'Fair',
            label: 'Fair quality',
        };
    }
    return {
        color: 'from-red-500/20 to-rose-500/20',
        border: 'border-red-500/30',
        glow: 'hover:shadow-red-500/20',
        badge: 'bg-red-500/20 text-red-300',
        badgeText: 'Poor',
        label: 'Poor quality',
    };
}

function buildMetrics(data: WaterData): Metric[] {
    return [
        {
            label: 'pH',
            value: data.ph !== undefined ? String(data.ph) : '--',
            unit: '',
            icon: '💧',
            description: 'Neutral balance',
            color: 'from-blue-500/20 to-cyan-500/20',
            border: 'border-blue-500/30',
            glow: 'hover:shadow-blue-500/20',
        },
        {
            label: 'TDS',
            value: data.tds !== undefined ? String(data.tds) : '--',
            unit: 'ppm',
            icon: '🧪',
            description: 'Total dissolved solids',
            color: 'from-purple-500/20 to-violet-500/20',
            border: 'border-purple-500/30',
            glow: 'hover:shadow-purple-500/20',
        },
        {
            label: 'Temperature',
            value: data.temp !== undefined ? String(data.temp) : '--',
            unit: '°C',
            icon: '🌡️',
            description: 'Water temperature',
            color: 'from-orange-500/20 to-amber-500/20',
            border: 'border-orange-500/30',
            glow: 'hover:shadow-orange-500/20',
        },
        {
            label: 'Grade',
            value: data.grade !== undefined ? data.grade : '--',
            unit: '',
            icon: '✅',
            description: 'Quality rating',
            color: 'from-green-500/20 to-emerald-500/20',
            border: 'border-green-500/30',
            glow: 'hover:shadow-green-500/20',
        },
    ];
}

export default function WaterDashboard() {
    const [waterData, setWaterData] = useState<WaterData | null>(null);
    const [loading, setLoading] = useState(true);
    const [city, setCity] = useState<string>('');

    useEffect(() => {
        const waterRef = query(ref(database, 'water-data'), limitToLast(1));

        const unsubscribe = onValue(waterRef, (snapshot) => {
            if (snapshot.exists()) {
                const raw = snapshot.val();
                const latest: WaterData = Object.values(raw)[0] as WaterData;
                setWaterData(latest);
                setCity(latest.city ?? '');
            } else {
                setWaterData({});
            }
            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    if (loading) {
        return (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-5 mb-10">
                {[...Array(5)].map((_, i) => (
                    <div
                        key={i}
                        className="rounded-2xl border border-white/10 bg-white/5 p-6 h-40 animate-pulse"
                    >
                        <div className="h-4 w-1/2 bg-white/10 rounded mb-4" />
                        <div className="h-10 w-3/4 bg-white/10 rounded mb-2" />
                        <div className="h-3 w-1/3 bg-white/10 rounded" />
                    </div>
                ))}
            </div>
        );
    }

    const metrics = buildMetrics(waterData ?? {});
    const wqi = waterData?.wqi;
    const wStyle = wqiStyle(wqi);

    return (
        <>
            {/* City badge */}
            {city && (
                <div className="flex justify-center mb-6">
                    <span className="inline-flex items-center gap-2 bg-white/5 border border-white/10 rounded-full px-4 py-1.5 text-sm text-gray-400">
                        📍 {city}
                    </span>
                </div>
            )}

            {/* Metric Cards — 5 columns on large screens */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-5 mb-10">

                {/* Standard sensor cards */}
                {metrics.map((metric) => (
                    <div
                        key={metric.label}
                        className={`
              relative rounded-2xl border ${metric.border}
              bg-linear-to-br ${metric.color}
              backdrop-blur-md bg-white/5
              p-6 flex flex-col gap-3
              shadow-lg hover:shadow-xl ${metric.glow}
              hover:-translate-y-1 hover:scale-[1.02]
              transition-all duration-300 ease-in-out
              cursor-default
            `}
                    >
                        <div className="flex items-center justify-between">
                            <span className="text-2xl">{metric.icon}</span>
                            <span className="text-xs font-medium text-gray-400 uppercase tracking-widest">
                                {metric.label}
                            </span>
                        </div>

                        <div className="flex items-end gap-1">
                            <span className="text-4xl font-bold text-white leading-none">
                                {metric.value}
                            </span>
                            {metric.unit && (
                                <span className="text-lg text-gray-400 mb-0.5">{metric.unit}</span>
                            )}
                        </div>

                        <p className="text-xs text-gray-500">{metric.description}</p>

                        <div className="absolute bottom-3 right-3 w-12 h-12 rounded-full blur-2xl opacity-30 bg-white pointer-events-none" />
                    </div>
                ))}

                {/* WQI Card */}
                <div
                    className={`
            relative rounded-2xl border ${wStyle.border}
            bg-linear-to-br ${wStyle.color}
            backdrop-blur-md bg-white/5
            p-6 flex flex-col gap-3
            shadow-lg hover:shadow-xl ${wStyle.glow}
            hover:-translate-y-1 hover:scale-[1.02]
            transition-all duration-300 ease-in-out
            cursor-default
          `}
                >
                    <div className="flex items-center justify-between">
                        <span className="text-2xl">📊</span>
                        <span className="text-xs font-medium text-gray-400 uppercase tracking-widest">
                            WQI
                        </span>
                    </div>

                    <div className="flex items-end gap-1">
                        <span className="text-4xl font-bold text-white leading-none">
                            {wqi !== undefined ? wqi : '--'}
                        </span>
                        <span className="text-lg text-gray-400 mb-0.5">/100</span>
                    </div>

                    {/* Colour-coded badge */}
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full w-fit ${wStyle.badge}`}>
                        {wStyle.badgeText}
                    </span>

                    <p className="text-xs text-gray-500">{wStyle.label}</p>

                    <div className="absolute bottom-3 right-3 w-12 h-12 rounded-full blur-2xl opacity-30 bg-white pointer-events-none" />
                </div>
            </div>
        </>
    );
}
