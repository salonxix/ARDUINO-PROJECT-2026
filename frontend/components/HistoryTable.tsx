'use client';

import { useEffect, useState, useMemo } from 'react';
import { ref, onValue } from 'firebase/database';
import { database } from '@/lib/firebase';

// ── Types ─────────────────────────────────────────────────────────────────────

interface WaterEntry {
    key: string;
    city?: string;
    country?: string;
    ph?: number;
    tds?: number;
    temp?: number;
    grade?: string;
    wqi?: number;
    timestamp?: number;
}

type SortKey = 'city' | 'country' | 'ph' | 'tds' | 'temp' | 'grade' | 'wqi';
type SortDir = 'asc' | 'desc';

// ── Helpers ───────────────────────────────────────────────────────────────────

function gradeColor(grade?: string): string {
    if (!grade) return '#6b7280';
    const g = grade.toUpperCase();
    if (g.startsWith('A')) return '#22c55e';
    if (g === 'B' || g === 'C') return '#eab308';
    return '#ef4444';
}

function wqiColor(wqi?: number): string {
    if (wqi === undefined) return '#6b7280';
    if (wqi >= 85) return '#22c55e';
    if (wqi >= 70) return '#eab308';
    if (wqi >= 55) return '#f97316';
    return '#ef4444';
}

function fmt(val: number | undefined, unit = ''): string {
    return val !== undefined && val !== null ? `${val}${unit}` : '—';
}

// ── Sort icon ─────────────────────────────────────────────────────────────────

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
    return (
        <span className={`ml-1 text-xs transition-opacity ${active ? 'opacity-100' : 'opacity-30'}`}>
            {active && dir === 'desc' ? '↓' : '↑'}
        </span>
    );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function HistoryTable() {
    const [entries, setEntries] = useState<WaterEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [sortKey, setSortKey] = useState<SortKey>('timestamp' as SortKey);
    const [sortDir, setSortDir] = useState<SortDir>('desc');

    useEffect(() => {
        const waterRef = ref(database, 'water-data');
        const unsubscribe = onValue(waterRef, (snapshot) => {
            if (snapshot.exists()) {
                const raw = snapshot.val() as Record<string, Omit<WaterEntry, 'key'>>;
                const list: WaterEntry[] = Object.entries(raw).map(([key, v]) => ({ key, ...v }));
                setEntries(list);
            } else {
                setEntries([]);
            }
            setLoading(false);
        });
        return () => unsubscribe();
    }, []);

    // ── Search + Sort ──────────────────────────────────────────────────────────

    const processed = useMemo(() => {
        const q = search.toLowerCase();

        const filtered = entries.filter((e) =>
            [e.city, e.country, e.grade]
                .map((v) => (v ?? '').toLowerCase())
                .some((v) => v.includes(q)) ||
            [e.ph, e.tds, e.temp, e.wqi]
                .map((v) => String(v ?? ''))
                .some((v) => v.includes(q))
        );

        return [...filtered].sort((a, b) => {
            const aVal = a[sortKey as keyof WaterEntry] ?? '';
            const bVal = b[sortKey as keyof WaterEntry] ?? '';
            const cmp =
                typeof aVal === 'number' && typeof bVal === 'number'
                    ? aVal - bVal
                    : String(aVal).localeCompare(String(bVal));
            return sortDir === 'asc' ? cmp : -cmp;
        });
    }, [entries, search, sortKey, sortDir]);

    function toggleSort(key: SortKey) {
        if (sortKey === key) {
            setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
        } else {
            setSortKey(key);
            setSortDir('asc');
        }
    }

    // ── Column config ──────────────────────────────────────────────────────────

    const columns: { key: SortKey; label: string; icon: string }[] = [
        { key: 'city', label: 'City', icon: '📍' },
        { key: 'country', label: 'Country', icon: '🌐' },
        { key: 'ph', label: 'pH', icon: '💧' },
        { key: 'tds', label: 'TDS', icon: '🧪' },
        { key: 'temp', label: 'Temp', icon: '🌡️' },
        { key: 'grade', label: 'Grade', icon: '✅' },
        { key: 'wqi', label: 'WQI', icon: '📊' },
    ];

    return (
        <section className="max-w-5xl mx-auto mt-12">
            {/* Header */}
            <div className="flex items-center gap-3 mb-6">
                <div className="w-9 h-9 rounded-full bg-cyan-500/20 border border-cyan-500/30 flex items-center justify-center text-lg">
                    🗂️
                </div>
                <div>
                    <h2 className="text-xl font-semibold text-white">History</h2>
                    <p className="text-xs text-gray-500 mt-0.5">All recorded sensor readings</p>
                </div>
                <span className="ml-auto text-xs px-3 py-1 rounded-full bg-white/5 border border-white/10 text-gray-400">
                    {processed.length} record{processed.length !== 1 ? 's' : ''}
                </span>
            </div>

            {/* Search bar */}
            <div className="relative mb-4">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">🔍</span>
                <input
                    type="text"
                    placeholder="Search by city, country, grade…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    suppressHydrationWarning
                    className="
            w-full pl-9 pr-4 py-2.5 rounded-xl
            bg-white/5 border border-white/10
            text-sm text-gray-200 placeholder-gray-600
            focus:outline-none focus:border-cyan-500/50 focus:bg-white/8
            transition-all duration-200
          "
                />
                {search && (
                    <button
                        onClick={() => setSearch('')}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 text-lg leading-none"
                    >
                        ×
                    </button>
                )}
            </div>

            {/* Table */}
            <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-md shadow-xl overflow-hidden">
                {loading ? (
                    <div className="p-12 text-center text-gray-600 text-sm animate-pulse">
                        Loading…
                    </div>
                ) : processed.length === 0 ? (
                    <div className="p-12 text-center text-gray-600 text-sm">
                        {search ? 'No results match your search.' : 'No data yet. Send sensor readings to see history.'}
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            {/* Head */}
                            <thead>
                                <tr className="border-b border-white/10 bg-white/5">
                                    {columns.map(({ key, label, icon }) => (
                                        <th
                                            key={key}
                                            onClick={() => toggleSort(key)}
                                            className="
                        px-4 py-3 text-left text-xs font-semibold
                        text-gray-400 uppercase tracking-widest
                        cursor-pointer select-none whitespace-nowrap
                        hover:text-gray-200 transition-colors
                      "
                                        >
                                            {icon} {label}
                                            <SortIcon active={sortKey === key} dir={sortDir} />
                                        </th>
                                    ))}
                                </tr>
                            </thead>

                            {/* Body */}
                            <tbody>
                                {processed.map((row, i) => {
                                    const gc = gradeColor(row.grade);
                                    const wc = wqiColor(row.wqi);
                                    return (
                                        <tr
                                            key={row.key}
                                            className={`
                        border-b border-white/5 last:border-0
                        transition-colors duration-150
                        hover:bg-white/5
                        ${i % 2 === 0 ? '' : 'bg-white/2'}
                      `}
                                        >
                                            {/* City */}
                                            <td className="px-4 py-3 font-medium text-gray-200 whitespace-nowrap">
                                                {row.city || '—'}
                                            </td>

                                            {/* Country */}
                                            <td className="px-4 py-3 text-gray-400 whitespace-nowrap">
                                                {row.country || '—'}
                                            </td>

                                            {/* pH */}
                                            <td className="px-4 py-3 text-cyan-300 font-mono">
                                                {fmt(row.ph)}
                                            </td>

                                            {/* TDS */}
                                            <td className="px-4 py-3 text-purple-300 font-mono">
                                                {fmt(row.tds, ' ppm')}
                                            </td>

                                            {/* Temperature */}
                                            <td className="px-4 py-3 text-orange-300 font-mono">
                                                {fmt(row.temp, '°C')}
                                            </td>

                                            {/* Grade badge */}
                                            <td className="px-4 py-3">
                                                <span style={{
                                                    background: `${gc}18`,
                                                    border: `1px solid ${gc}60`,
                                                    color: gc,
                                                    borderRadius: '999px',
                                                    padding: '2px 10px',
                                                    fontSize: '12px',
                                                    fontWeight: 700,
                                                }}>
                                                    {row.grade ?? '—'}
                                                </span>
                                            </td>

                                            {/* WQI */}
                                            <td className="px-4 py-3">
                                                <div className="flex items-center gap-2">
                                                    {/* Mini bar */}
                                                    <div className="w-12 h-1.5 rounded-full bg-white/10 overflow-hidden">
                                                        <div
                                                            className="h-full rounded-full"
                                                            style={{
                                                                width: `${row.wqi ?? 0}%`,
                                                                background: wc,
                                                            }}
                                                        />
                                                    </div>
                                                    <span className="font-mono text-xs" style={{ color: wc }}>
                                                        {row.wqi ?? '—'}
                                                    </span>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </section>
    );
}
