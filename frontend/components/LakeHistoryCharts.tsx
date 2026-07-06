'use client';

import { useEffect, useState, useCallback } from 'react';
import {
    ResponsiveContainer, LineChart, Line,
    XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';

// ── Types ─────────────────────────────────────────────────────────────────────

interface LakePeriod {
    period: string;
    month?: string;
    year?: number;
    ph?: number;
    do?: number;
    bod?: number;
    cod?: number;
    turbidity?: number;
    conductivity?: number;
    tds?: number;
}

interface LakeData {
    name: string;
    history: Record<string, LakePeriod>;
}

// Sort by year then month
const MONTH_ORDER = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];

function sortPeriods(periods: LakePeriod[]): LakePeriod[] {
    return [...periods].sort((a, b) => {
        if ((a.year ?? 0) !== (b.year ?? 0)) return (a.year ?? 0) - (b.year ?? 0);
        return MONTH_ORDER.indexOf(a.month ?? '') - MONTH_ORDER.indexOf(b.month ?? '');
    });
}

// ── Chart lines config ────────────────────────────────────────────────────────

const PARAMS = [
    { key: 'ph', label: 'pH', color: '#38bdf8', unit: '' },
    { key: 'do', label: 'DO', color: '#34d399', unit: ' mg/L' },
    { key: 'bod', label: 'BOD', color: '#f97316', unit: ' mg/L' },
    { key: 'cod', label: 'COD', color: '#a78bfa', unit: ' mg/L' },
    { key: 'turbidity', label: 'Turbidity', color: '#60a5fa', unit: ' NTU' },
    { key: 'conductivity', label: 'Conductivity', color: '#fb923c', unit: ' µmho/cm' },
] as const;

// ── Custom tooltip ────────────────────────────────────────────────────────────

function DarkTooltip({ active, payload, label }: {
    active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string;
}) {
    if (!active || !payload?.length) return null;
    return (
        <div style={{
            background: '#0f172a', border: '1px solid #1e293b',
            borderRadius: 10, padding: '10px 14px', fontSize: 12, color: '#f1f5f9',
            boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
        }}>
            <div style={{ color: '#64748b', marginBottom: 6, fontSize: 11 }}>{label}</div>
            {payload.map((p) => (
                <div key={p.name} style={{ color: p.color, fontWeight: 600 }}>
                    {p.name}: {p.value ?? '—'}
                </div>
            ))}
        </div>
    );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function LakeHistoryCharts() {
    const [lakeList, setLakeList] = useState<string[]>([]);
    const [selected, setSelected] = useState<string>('');
    const [lakeData, setLakeData] = useState<LakeData | null>(null);
    const [loading, setLoading] = useState(false);
    const [listLoading, setListLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [activeParams, setActiveParams] = useState<Set<string>>(
        new Set(['ph', 'do', 'bod'])
    );

    // ── Load lake list ────────────────────────────────────────────────────────

    useEffect(() => {
        fetch('/api/lake-dataset')
            .then(r => r.json())
            .then((data: { name: string }[]) => {
                if (Array.isArray(data)) {
                    const names = data.map(l => l.name).filter(Boolean).sort();
                    setLakeList(names);
                    if (names.length > 0) setSelected(names[0]);
                }
            })
            .catch(() => { })
            .finally(() => setListLoading(false));
    }, []);

    // ── Load history for selected lake ────────────────────────────────────────

    const fetchHistory = useCallback(async (name: string) => {
        if (!name) return;
        setLoading(true); setError(null); setLakeData(null);
        try {
            const res = await fetch(`/api/lake-dataset?lake=${encodeURIComponent(name)}&history=true`);
            const data = await res.json();
            if (!res.ok || data.error) throw new Error(data.error ?? 'Failed to load history.');
            setLakeData({ name, history: data.history ?? {} });
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load history.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { if (selected) fetchHistory(selected); }, [selected, fetchHistory]);

    // ── Prepare chart data ────────────────────────────────────────────────────

    const chartData = lakeData
        ? sortPeriods(Object.values(lakeData.history)).map((p) => ({
            period: p.period ?? `${p.month} ${p.year}`,
            ph: p.ph ?? null,
            do: p.do ?? null,
            bod: p.bod ?? null,
            cod: p.cod ?? null,
            turbidity: p.turbidity ?? null,
            conductivity: p.conductivity ?? null,
        }))
        : [];

    const toggleParam = (key: string) => {
        setActiveParams(prev => {
            const next = new Set(prev);
            next.has(key) ? next.delete(key) : next.add(key);
            return next;
        });
    };

    return (
        <section className="max-w-5xl mx-auto mt-12" id="lake-charts">

            {/* Header */}
            <div className="flex flex-wrap items-center gap-3 mb-6">
                <div className="w-9 h-9 rounded-full bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-lg">📈</div>
                <div>
                    <h2 className="text-xl font-semibold text-white">Lake Historical Trends</h2>
                    <p className="text-xs text-gray-500 mt-0.5">KSPCB monthly water quality data</p>
                </div>

                {/* Lake selector */}
                <div className="ml-auto">
                    {listLoading ? (
                        <div className="text-xs text-gray-500 animate-pulse">Loading lakes…</div>
                    ) : (
                        <select
                            value={selected}
                            onChange={(e) => setSelected(e.target.value)}
                            className="text-sm bg-white/5 border border-white/15 text-gray-200 rounded-xl px-3 py-2 outline-none focus:border-indigo-500/50 cursor-pointer"
                        >
                            {lakeList.map(l => (
                                <option key={l} value={l} style={{ background: '#0f172a' }}>{l}</option>
                            ))}
                        </select>
                    )}
                </div>
            </div>

            {/* Parameter toggles */}
            <div className="flex flex-wrap gap-2 mb-4">
                {PARAMS.map(({ key, label, color }) => (
                    <button key={key} onClick={() => toggleParam(key)}
                        className="text-xs px-3 py-1.5 rounded-full border transition-all cursor-pointer"
                        style={{
                            borderColor: activeParams.has(key) ? color : 'rgba(255,255,255,0.1)',
                            background: activeParams.has(key) ? `${color}20` : 'transparent',
                            color: activeParams.has(key) ? color : '#64748b',
                            fontWeight: activeParams.has(key) ? 700 : 400,
                        }}>
                        {label}
                    </button>
                ))}
            </div>

            {/* Chart card */}
            <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-md shadow-xl p-5">
                {loading && (
                    <div className="h-64 flex items-center justify-center text-gray-600 text-sm animate-pulse">
                        Loading data for {selected}…
                    </div>
                )}
                {error && !loading && (
                    <div className="h-64 flex items-center justify-center text-red-400 text-sm">{error}</div>
                )}
                {!loading && !error && chartData.length === 0 && (
                    <div className="h-64 flex items-center justify-center text-gray-600 text-sm">
                        No historical data available for this lake.
                    </div>
                )}
                {!loading && !error && chartData.length > 0 && (
                    <ResponsiveContainer width="100%" height={320}>
                        <LineChart data={chartData} margin={{ top: 4, right: 8, left: -16, bottom: 20 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                            <XAxis
                                dataKey="period"
                                tick={{ fill: '#475569', fontSize: 9 }}
                                axisLine={false} tickLine={false}
                                interval="preserveStartEnd"
                                angle={-35} textAnchor="end"
                            />
                            <YAxis tick={{ fill: '#475569', fontSize: 9 }} axisLine={false} tickLine={false} />
                            <Tooltip content={<DarkTooltip />} />
                            <Legend wrapperStyle={{ fontSize: 11, color: '#94a3b8', paddingTop: 8 }} />
                            {PARAMS.filter(p => activeParams.has(p.key)).map(({ key, label, color }) => (
                                <Line
                                    key={key}
                                    type="monotone"
                                    dataKey={key}
                                    name={label}
                                    stroke={color}
                                    strokeWidth={2}
                                    dot={{ r: 2, fill: color, strokeWidth: 0 }}
                                    activeDot={{ r: 4, fill: color, stroke: '#0f172a', strokeWidth: 2 }}
                                    connectNulls
                                />
                            ))}
                        </LineChart>
                    </ResponsiveContainer>
                )}

                {/* Sample count */}
                {!loading && !error && chartData.length > 0 && (
                    <p className="text-xs text-gray-600 text-right mt-2">
                        {chartData.length} monthly readings · {selected}
                    </p>
                )}
            </div>
        </section>
    );
}
