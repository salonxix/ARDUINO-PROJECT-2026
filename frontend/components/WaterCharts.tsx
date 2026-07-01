'use client';

import { useEffect, useState } from 'react';
import { ref, onValue } from 'firebase/database';
import { database } from '@/lib/firebase';
import {
    ResponsiveContainer,
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ReferenceLine,
} from 'recharts';

// ── Types ─────────────────────────────────────────────────────────────────────

interface ChartPoint {
    label: string;   // city or index
    ph?: number;
    tds?: number;
    temp?: number;
    wqi?: number;
    timestamp?: number;
}

// ── Custom tooltip ────────────────────────────────────────────────────────────

interface TooltipProps {
    active?: boolean;
    payload?: { value: number; name: string; color: string }[];
    label?: string;
    unit: string;
}

function DarkTooltip({ active, payload, label, unit }: TooltipProps) {
    if (!active || !payload?.length) return null;
    return (
        <div style={{
            background: '#0f172a',
            border: '1px solid #1e293b',
            borderRadius: '10px',
            padding: '10px 14px',
            fontSize: '12px',
            color: '#f1f5f9',
            boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
        }}>
            <div style={{ color: '#64748b', marginBottom: '4px', fontSize: '11px' }}>{label}</div>
            <div style={{ fontWeight: 700, color: payload[0].color, fontSize: '15px' }}>
                {payload[0].value}{unit}
            </div>
        </div>
    );
}

// ── Single chart card ─────────────────────────────────────────────────────────

interface ChartCardProps {
    title: string;
    icon: string;
    dataKey: keyof ChartPoint;
    data: ChartPoint[];
    color: string;
    unit: string;
    border: string;
    refLine?: number;
    refLabel?: string;
    domain?: [number | 'auto', number | 'auto'];
}

function ChartCard({
    title, icon, dataKey, data, color, unit, border, refLine, refLabel, domain,
}: ChartCardProps) {
    return (
        <div className={`
      relative rounded-2xl border ${border}
      bg-white/5 backdrop-blur-md
      p-5 shadow-lg
      hover:shadow-xl transition-all duration-300
    `}>
            {/* Header */}
            <div className="flex items-center gap-2 mb-4">
                <span className="text-xl">{icon}</span>
                <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-widest">{title}</h3>
                <span className="ml-auto text-xs text-gray-600">{data.length} readings</span>
            </div>

            {/* Chart */}
            <ResponsiveContainer width="100%" height={180}>
                <LineChart data={data} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                    <XAxis
                        dataKey="label"
                        tick={{ fill: '#475569', fontSize: 10 }}
                        axisLine={false}
                        tickLine={false}
                        interval="preserveStartEnd"
                    />
                    <YAxis
                        domain={domain ?? ['auto', 'auto']}
                        tick={{ fill: '#475569', fontSize: 10 }}
                        axisLine={false}
                        tickLine={false}
                    />
                    <Tooltip content={<DarkTooltip unit={unit} />} />
                    {refLine !== undefined && (
                        <ReferenceLine
                            y={refLine}
                            stroke={color}
                            strokeDasharray="4 4"
                            strokeOpacity={0.4}
                            label={{ value: refLabel, fill: color, fontSize: 9, opacity: 0.6 }}
                        />
                    )}
                    <Line
                        type="monotone"
                        dataKey={dataKey}
                        stroke={color}
                        strokeWidth={2}
                        dot={{ r: 3, fill: color, strokeWidth: 0 }}
                        activeDot={{ r: 5, fill: color, stroke: '#0f172a', strokeWidth: 2 }}
                        connectNulls
                    />
                </LineChart>
            </ResponsiveContainer>

            {/* Decorative glow */}
            <div
                className="absolute bottom-4 right-4 w-16 h-16 rounded-full blur-3xl opacity-10 pointer-events-none"
                style={{ background: color }}
            />
        </div>
    );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function WaterCharts() {
    const [data, setData] = useState<ChartPoint[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const waterRef = ref(database, 'water-data');

        const unsubscribe = onValue(waterRef, (snapshot) => {
            if (snapshot.exists()) {
                const raw = snapshot.val() as Record<string, ChartPoint & { city?: string }>;

                const points: ChartPoint[] = Object.entries(raw)
                    .map(([, v]) => v)
                    .sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0))
                    .map((v, i) => ({
                        label: v.city ? String(v.city) : `#${i + 1}`,
                        ph: v.ph,
                        tds: v.tds,
                        temp: v.temp,
                        wqi: v.wqi,
                        timestamp: v.timestamp,
                    }));

                setData(points);
            } else {
                setData([]);
            }
            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    const charts: ChartCardProps[] = [
        {
            title: 'pH Level',
            icon: '💧',
            dataKey: 'ph',
            color: '#38bdf8',
            unit: '',
            border: 'border-blue-500/20',
            refLine: 7.0,
            refLabel: 'Ideal',
            domain: [0, 14],
        },
        {
            title: 'TDS',
            icon: '🧪',
            dataKey: 'tds',
            color: '#a78bfa',
            unit: ' ppm',
            border: 'border-purple-500/20',
            refLine: 300,
            refLabel: 'Safe',
        },
        {
            title: 'Temperature',
            icon: '🌡️',
            dataKey: 'temp',
            color: '#fb923c',
            unit: '°C',
            border: 'border-orange-500/20',
            refLine: 25,
            refLabel: 'Ideal',
        },
        {
            title: 'WQI',
            icon: '📊',
            dataKey: 'wqi',
            color: '#34d399',
            unit: '',
            border: 'border-green-500/20',
            refLine: 70,
            refLabel: 'Good',
            domain: [0, 100],
        },
    ];

    return (
        <section className="max-w-5xl mx-auto mt-12">
            {/* Section header */}
            <div className="flex items-center gap-3 mb-6">
                <div className="w-9 h-9 rounded-full bg-purple-500/20 border border-purple-500/30 flex items-center justify-center text-lg">
                    📈
                </div>
                <div>
                    <h2 className="text-xl font-semibold text-white">Sensor Trends</h2>
                    <p className="text-xs text-gray-500 mt-0.5">Historical readings from all locations</p>
                </div>
                <span className="ml-auto text-xs px-3 py-1 rounded-full bg-white/5 border border-white/10 text-gray-400">
                    {data.length} sample{data.length !== 1 ? 's' : ''}
                </span>
            </div>

            {loading ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    {[...Array(4)].map((_, i) => (
                        <div key={i} className="rounded-2xl border border-white/10 bg-white/5 h-60 animate-pulse" />
                    ))}
                </div>
            ) : data.length === 0 ? (
                <div className="rounded-2xl border border-white/10 bg-white/5 p-12 text-center text-gray-600 text-sm">
                    No data yet. Send sensor readings to see charts.
                </div>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    {charts.map((c) => (
                        <ChartCard key={c.title} {...c} data={data} />
                    ))}
                </div>
            )}
        </section>
    );
}
