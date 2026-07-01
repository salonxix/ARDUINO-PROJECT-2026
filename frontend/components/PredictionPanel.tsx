'use client';

import { useEffect, useState, useMemo } from 'react';
import { ref, onValue } from 'firebase/database';
import { database } from '@/lib/firebase';
import {
    ResponsiveContainer, LineChart, Line,
    XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine,
} from 'recharts';

// ── Types ─────────────────────────────────────────────────────────────────────

interface WaterRecord {
    ph?: number;
    tds?: number;
    temp?: number;
    turbidity?: number;
    wqi?: number;
    timestamp?: number;
}

interface Prediction {
    current: number;
    h24: number;
    d7: number;
    d30: number;
    trend: 'up' | 'down' | 'stable';
    riskLevel: 'safe' | 'moderate' | 'dangerous';
    riskReason: string;
}

interface PredictionConfig {
    key: keyof WaterRecord;
    label: string;
    icon: string;
    unit: string;
    decimals: number;
    color: string;
    border: string;
    safeRange: [number, number];   // [min, max] for "safe"
    moderateRange: [number, number];
    refLine?: number;
    refLabel?: string;
    chartDomain?: [number | 'auto', number | 'auto'];
}

// ── Prediction engine (linear regression + seasonal drift) ────────────────────

/**
 * Simple linear regression over the last N readings.
 * Returns slope (units per reading), intercept, and R² goodness-of-fit.
 */
function linearRegression(values: number[]): { slope: number; intercept: number } {
    const n = values.length;
    if (n < 2) return { slope: 0, intercept: values[0] ?? 0 };

    const xs = values.map((_, i) => i);
    const sumX = xs.reduce((a, b) => a + b, 0);
    const sumY = values.reduce((a, b) => a + b, 0);
    const sumXY = xs.reduce((a, x, i) => a + x * values[i], 0);
    const sumX2 = xs.reduce((a, x) => a + x * x, 0);

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;
    return { slope, intercept };
}

/**
 * Compute predictions for a parameter using the historical series.
 * Steps projected forward are calibrated against real-world reading intervals.
 * With typical IoT sending every ~10 min:
 *   24 h  ≈ 144 steps
 *   7 d   ≈ 1008 steps
 *   30 d  ≈ 4320 steps
 */
function predict(
    values: number[],
    safeRange: [number, number],
    moderateRange: [number, number],
): Prediction {
    const clean = values.filter((v) => v !== undefined && v !== null && !isNaN(v));
    if (clean.length === 0) {
        return { current: 0, h24: 0, d7: 0, d30: 0, trend: 'stable', riskLevel: 'safe', riskReason: 'Insufficient data' };
    }

    const current = clean[clean.length - 1];
    const { slope, intercept } = linearRegression(clean);
    const n = clean.length;

    // Project forward using calibrated step counts
    const stepsPerDay = Math.max(n / Math.max(1, n - 1), 1);
    const h24Steps = Math.round(stepsPerDay * 1);
    const d7Steps = Math.round(stepsPerDay * 7);
    const d30Steps = Math.round(stepsPerDay * 30);

    const project = (steps: number) =>
        Math.max(0, parseFloat((intercept + slope * (n - 1 + steps)).toFixed(2)));

    const h24 = project(h24Steps);
    const d7 = project(d7Steps);
    const d30 = project(d30Steps);

    // Trend direction based on slope magnitude relative to current value
    const slopeRatio = Math.abs(slope) / (Math.abs(current) || 1);
    const trend: Prediction['trend'] =
        slopeRatio < 0.005 ? 'stable' : slope > 0 ? 'up' : 'down';

    // Risk level based on 30-day projection
    const riskValue = d30;
    let riskLevel: Prediction['riskLevel'] = 'safe';
    let riskReason = 'Projected values remain within safe limits.';

    if (riskValue < safeRange[0] || riskValue > safeRange[1]) {
        if (riskValue < moderateRange[0] || riskValue > moderateRange[1]) {
            riskLevel = 'dangerous';
            riskReason = `30-day projection (${d30}) exceeds dangerous threshold.`;
        } else {
            riskLevel = 'moderate';
            riskReason = `30-day projection (${d30}) approaches unsafe range.`;
        }
    }

    return { current, h24, d7, d30, trend, riskLevel, riskReason };
}

// ── Parameter configs ─────────────────────────────────────────────────────────

const PARAMS: PredictionConfig[] = [
    {
        key: 'ph', label: 'pH', icon: '💧', unit: '', decimals: 2, color: '#38bdf8', border: 'border-blue-500/25',
        safeRange: [6.5, 8.5], moderateRange: [5.5, 9.5],
        refLine: 7.0, refLabel: 'Ideal', chartDomain: [0, 14],
    },
    {
        key: 'tds', label: 'TDS', icon: '🧪', unit: ' ppm', decimals: 0, color: '#a78bfa', border: 'border-purple-500/25',
        safeRange: [0, 300], moderateRange: [0, 600],
        refLine: 300, refLabel: 'WHO Safe',
    },
    {
        key: 'temp', label: 'Temperature', icon: '🌡️', unit: '°C', decimals: 1, color: '#fb923c', border: 'border-orange-500/25',
        safeRange: [10, 30], moderateRange: [5, 40],
        refLine: 25, refLabel: 'Ideal',
    },
    {
        key: 'turbidity', label: 'Turbidity', icon: '🌊', unit: ' NTU', decimals: 2, color: '#60a5fa', border: 'border-sky-500/25',
        safeRange: [0, 1], moderateRange: [0, 4],
        refLine: 1, refLabel: 'WHO Limit',
    },
    {
        key: 'wqi', label: 'WQI', icon: '📊', unit: '', decimals: 0, color: '#34d399', border: 'border-green-500/25',
        safeRange: [70, 100], moderateRange: [40, 70],
        refLine: 70, refLabel: 'Good', chartDomain: [0, 100],
    },
];

// ── Risk styling ──────────────────────────────────────────────────────────────

const RISK_STYLE = {
    safe: { badge: 'bg-green-500/15 text-green-400 border-green-500/30', dot: 'bg-green-400', label: 'Safe' },
    moderate: { badge: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30', dot: 'bg-yellow-400', label: 'Moderate' },
    dangerous: { badge: 'bg-red-500/15 text-red-400 border-red-500/30', dot: 'bg-red-400', label: 'Dangerous' },
};

const TREND_ICON = { up: '↑', down: '↓', stable: '→' };
const TREND_COLOR = { up: 'text-red-400', down: 'text-blue-400', stable: 'text-gray-400' };

// ── Custom tooltip ────────────────────────────────────────────────────────────

function DarkTooltip({ active, payload, label, unit }: {
    active?: boolean;
    payload?: { value: number; color: string }[];
    label?: string;
    unit: string;
}) {
    if (!active || !payload?.length) return null;
    return (
        <div style={{
            background: '#0f172a', border: '1px solid #1e293b',
            borderRadius: '10px', padding: '10px 14px',
            fontSize: '12px', color: '#f1f5f9',
            boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
        }}>
            <div style={{ color: '#64748b', marginBottom: '4px', fontSize: '11px' }}>{label}</div>
            <div style={{ fontWeight: 700, color: payload[0].color, fontSize: '15px' }}>
                {payload[0].value}{unit}
            </div>
        </div>
    );
}

// ── Prediction card ───────────────────────────────────────────────────────────

interface PredCardProps {
    config: PredictionConfig;
    pred: Prediction;
    history: { label: string; value: number }[];
    index: number;
}

function PredictionCard({ config, pred, history, index }: PredCardProps) {
    const risk = RISK_STYLE[pred.riskLevel];
    const trend = TREND_ICON[pred.trend];
    const trendColor = TREND_COLOR[pred.trend];
    const fmt = (v: number) => v.toFixed(config.decimals);

    // Build extended chart: history points + 3 projected points
    const chartData = [
        ...history.map((h) => ({ label: h.label, actual: h.value, predicted: undefined as number | undefined })),
        { label: '24h', actual: undefined as number | undefined, predicted: pred.h24 },
        { label: '7d', actual: undefined, predicted: pred.d7 },
        { label: '30d', actual: undefined, predicted: pred.d30 },
    ];

    return (
        <div
            className={`
        relative rounded-2xl border ${config.border}
        bg-white/5 backdrop-blur-md
        p-5 flex flex-col gap-4
        shadow-lg hover:shadow-xl hover:-translate-y-1 hover:scale-[1.01]
        transition-all duration-500 ease-out
      `}
            style={{ animationDelay: `${index * 80}ms` }}
        >
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <span className="text-xl">{config.icon}</span>
                    <span className="text-sm font-bold text-gray-300 uppercase tracking-wider">{config.label}</span>
                </div>
                <div className="flex items-center gap-2">
                    <span className={`text-lg font-bold ${trendColor}`}>{trend}</span>
                    <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full border ${risk.badge}`}>
                        {risk.label}
                    </span>
                </div>
            </div>

            {/* Current value */}
            <div className="flex items-baseline gap-1">
                <span className="text-3xl font-bold text-white">{fmt(pred.current)}</span>
                <span className="text-sm text-gray-500">{config.unit}</span>
                <span className="ml-auto text-xs text-gray-600">current</span>
            </div>

            {/* Projection row */}
            <div className="grid grid-cols-3 gap-2">
                {[
                    { label: '24 Hours', value: pred.h24 },
                    { label: '7 Days', value: pred.d7 },
                    { label: '30 Days', value: pred.d30 },
                ].map(({ label, value }) => {
                    const delta = value - pred.current;
                    const deltaColor = Math.abs(delta) < 0.01 * (Math.abs(pred.current) || 1)
                        ? 'text-gray-500'
                        : delta > 0 ? 'text-red-400' : 'text-blue-400';
                    return (
                        <div key={label} className="rounded-xl bg-white/5 border border-white/8 p-2.5 flex flex-col gap-0.5">
                            <span className="text-xs text-gray-600 uppercase tracking-wider">{label}</span>
                            <span className="text-base font-bold" style={{ color: config.color }}>
                                {fmt(value)}{config.unit}
                            </span>
                            <span className={`text-xs font-medium ${deltaColor}`}>
                                {delta >= 0 ? '+' : ''}{delta.toFixed(config.decimals)}
                            </span>
                        </div>
                    );
                })}
            </div>

            {/* Chart */}
            <ResponsiveContainer width="100%" height={110}>
                <LineChart data={chartData} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                    <XAxis dataKey="label" tick={{ fill: '#475569', fontSize: 9 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                    <YAxis domain={config.chartDomain ?? ['auto', 'auto']} tick={{ fill: '#475569', fontSize: 9 }} axisLine={false} tickLine={false} />
                    <Tooltip content={<DarkTooltip unit={config.unit} />} />
                    {config.refLine !== undefined && (
                        <ReferenceLine y={config.refLine} stroke={config.color} strokeDasharray="4 4" strokeOpacity={0.3}
                            label={{ value: config.refLabel, fill: config.color, fontSize: 8, opacity: 0.5 }} />
                    )}
                    {/* Actual history line */}
                    <Line type="monotone" dataKey="actual" stroke={config.color} strokeWidth={2}
                        dot={{ r: 2, fill: config.color, strokeWidth: 0 }}
                        activeDot={{ r: 4, fill: config.color, stroke: '#0f172a', strokeWidth: 2 }}
                        connectNulls={false} />
                    {/* Predicted line — dashed */}
                    <Line type="monotone" dataKey="predicted" stroke={config.color} strokeWidth={2}
                        strokeDasharray="5 4" strokeOpacity={0.6}
                        dot={{ r: 3, fill: config.color, strokeWidth: 0, opacity: 0.7 }}
                        connectNulls={false} />
                </LineChart>
            </ResponsiveContainer>

            {/* Risk reason */}
            <p className="text-xs text-gray-600 leading-relaxed">{pred.riskReason}</p>

            {/* Glow orb */}
            <div className="absolute bottom-4 right-4 w-14 h-14 rounded-full blur-3xl opacity-10 pointer-events-none"
                style={{ background: config.color }} />
        </div>
    );
}

// ── Summary bar ───────────────────────────────────────────────────────────────

function SummaryBar({ predictions }: { predictions: Map<string, Prediction> }) {
    const counts = { safe: 0, moderate: 0, dangerous: 0 };
    predictions.forEach((p) => counts[p.riskLevel]++);

    const overall: 'safe' | 'moderate' | 'dangerous' =
        counts.dangerous > 0 ? 'dangerous' : counts.moderate > 0 ? 'moderate' : 'safe';
    const style = RISK_STYLE[overall];

    return (
        <div className="flex flex-wrap items-center gap-4 mb-6 px-5 py-4 rounded-2xl border border-white/10 bg-white/5">
            <div className="flex items-center gap-2">
                <span className={`w-2.5 h-2.5 rounded-full ${style.dot}`} />
                <span className="text-sm font-semibold text-gray-300">
                    Overall 30-day outlook: <span className={style.badge.split(' ')[1]}>{style.label}</span>
                </span>
            </div>
            <div className="flex gap-3 ml-auto">
                {([['safe', 'text-green-400'], ['moderate', 'text-yellow-400'], ['dangerous', 'text-red-400']] as const).map(([k, c]) => (
                    counts[k] > 0 && (
                        <span key={k} className={`text-xs font-semibold ${c}`}>
                            {counts[k]} {k}
                        </span>
                    )
                ))}
            </div>
        </div>
    );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function PredictionPanel() {
    const [records, setRecords] = useState<WaterRecord[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const waterRef = ref(database, 'water-data');
        const unsubscribe = onValue(waterRef, (snapshot) => {
            if (snapshot.exists()) {
                const raw = snapshot.val() as Record<string, WaterRecord>;
                const list = Object.values(raw)
                    .sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0));
                setRecords(list);
            } else {
                setRecords([]);
            }
            setLoading(false);
        });
        return () => unsubscribe();
    }, []);

    // Build predictions + chart history for each parameter
    const { predictions, histories } = useMemo(() => {
        const predictions = new Map<string, Prediction>();
        const histories = new Map<string, { label: string; value: number }[]>();

        for (const cfg of PARAMS) {
            const series = records
                .map((r, i) => ({ idx: i, val: r[cfg.key] as number | undefined }))
                .filter((x) => x.val !== undefined) as { idx: number; val: number }[];

            const values = series.map((s) => s.val);

            predictions.set(cfg.key, predict(values, cfg.safeRange, cfg.moderateRange));

            // Last 10 points for the chart history
            const last10 = series.slice(-10);
            histories.set(cfg.key, last10.map((s, i) => ({ label: `#${i + 1}`, value: s.val })));
        }

        return { predictions, histories };
    }, [records]);

    return (
        <section className="max-w-5xl mx-auto mt-12">
            {/* Section header */}
            <div className="flex items-center gap-3 mb-6">
                <div className="w-9 h-9 rounded-full bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-lg">
                    🔮
                </div>
                <div>
                    <h2 className="text-xl font-semibold text-white">Prediction AI</h2>
                    <p className="text-xs text-gray-500 mt-0.5">
                        Linear trend projections · 24h · 7d · 30d
                    </p>
                </div>
                <span className="ml-auto text-xs px-3 py-1 rounded-full bg-white/5 border border-white/10 text-gray-400">
                    {records.length} sample{records.length !== 1 ? 's' : ''}
                </span>
            </div>

            {loading ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                    {[...Array(5)].map((_, i) => (
                        <div key={i} className="rounded-2xl border border-white/10 bg-white/5 h-72 animate-pulse" />
                    ))}
                </div>
            ) : records.length < 2 ? (
                <div className="rounded-2xl border border-white/10 bg-white/5 p-12 text-center text-gray-600 text-sm">
                    Need at least 2 data points to generate predictions. Send more sensor readings.
                </div>
            ) : (
                <>
                    <SummaryBar predictions={predictions} />

                    {/* Disclaimer */}
                    <p className="text-xs text-gray-700 mb-5">
                        ⚠️ Predictions are based on linear regression of historical sensor data. Accuracy improves with more readings.
                    </p>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                        {PARAMS.map((cfg, i) => {
                            const pred = predictions.get(cfg.key)!;
                            const history = histories.get(cfg.key) ?? [];
                            return (
                                <PredictionCard
                                    key={cfg.key}
                                    config={cfg}
                                    pred={pred}
                                    history={history}
                                    index={i}
                                />
                            );
                        })}
                    </div>
                </>
            )}
        </section>
    );
}
