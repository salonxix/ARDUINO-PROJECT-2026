'use client';

import { useEffect, useState, useCallback } from 'react';
import { ref, onValue, query, limitToLast } from 'firebase/database';
import { database } from '@/lib/firebase';

// ── Types ─────────────────────────────────────────────────────────────────────

interface SensorData {
    ph?: number;
    tds?: number;
    temp?: number;
    turbidity?: number;
    gas?: number;
}

interface SensorParam {
    value: number | null;
    idealRange: string;
    status: 'LOW' | 'NORMAL' | 'HIGH';
    plainExplanation: string;
    analogy: string;
    healthImpact: string;
}

interface TreatmentDetail {
    boiling: string;
    filtration: string;
    reverseOsmosis: string;
    chlorination: string;
    uvTreatment: string;
}

interface UseCaseEffects {
    drinking: string;
    cooking: string;
    bathing: string;
    irrigation: string;
}

interface AnalysisResult {
    sensorAnalysis?: {
        ph?: SensorParam;
        tds?: SensorParam;
        temperature?: SensorParam;
        turbidity?: SensorParam;
        gas?: SensorParam;
    };
    idealRanges?: Record<string, string>;
    drinkingSuitability: string;
    cookingSuitability: string;
    bathingSuitability: string;
    irrigationSuitability: string;
    shortTermEffects?: UseCaseEffects;
    longTermEffects?: UseCaseEffects;
    possibleDiseases?: string[];
    possibleSkinDiseases?: string[];
    waterborneDiseasees?: string[];
    issuesDetected: string[];
    healthRisks: string[];
    precautions?: string[];
    suggestedTreatment: TreatmentDetail | string[];
    overallSummary: string;
    analyzedAt?: number;
}

interface LatestEntry extends SensorData {
    analysis?: AnalysisResult;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function suitabilityColor(v = ''): { bg: string; text: string; border: string } {
    const val = v.toLowerCase();
    if (val.includes('not suitable') || val.includes('not recommended'))
        return { bg: 'bg-red-500/10', text: 'text-red-400', border: 'border-red-500/30' };
    if (val.includes('after treatment') || val.includes('caution'))
        return { bg: 'bg-yellow-500/10', text: 'text-yellow-400', border: 'border-yellow-500/30' };
    return { bg: 'bg-green-500/10', text: 'text-green-400', border: 'border-green-500/30' };
}

function suitabilityIcon(v = ''): string {
    const val = v.toLowerCase();
    if (val.includes('not suitable')) return '❌';
    if (val.includes('after treatment') || val.includes('caution')) return '⚠️';
    return '✅';
}

function statusColor(s?: string) {
    if (s === 'HIGH') return { badge: 'bg-red-500/15 text-red-400 border-red-500/30' };
    if (s === 'LOW') return { badge: 'bg-blue-500/15 text-blue-400 border-blue-500/30' };
    return { badge: 'bg-green-500/15 text-green-400 border-green-500/30' };
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SuitabilityCard({ label, value, icon }: { label: string; value: string; icon: string }) {
    const c = suitabilityColor(value);
    return (
        <div className={`rounded-xl border ${c.border} ${c.bg} p-3 flex flex-col gap-1`}>
            <div className="flex items-center gap-1.5">
                <span>{icon}</span>
                <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{label}</span>
            </div>
            <div className={`flex items-center gap-1.5 text-sm font-semibold ${c.text}`}>
                <span>{suitabilityIcon(value)}</span>
                <span>{value}</span>
            </div>
        </div>
    );
}

function TagList({ title, icon, items, color }: { title: string; icon: string; items?: string[]; color: string }) {
    if (!items?.length) return null;
    return (
        <div>
            <div className={`flex items-center gap-2 text-xs font-bold uppercase tracking-wider mb-2 ${color}`}>
                <span>{icon}</span><span>{title}</span>
            </div>
            <ul className="space-y-1.5">
                {items.map((item, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-gray-300">
                        <span className={`mt-0.5 text-xs ${color}`}>▸</span><span>{item}</span>
                    </li>
                ))}
            </ul>
        </div>
    );
}

function SensorCard({ name, icon, param }: { name: string; icon: string; param?: SensorParam }) {
    if (!param) return null;
    const sc = statusColor(param.status);
    return (
        <div className="rounded-xl border border-white/10 bg-white/5 p-4 flex flex-col gap-2">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <span className="text-lg">{icon}</span>
                    <span className="text-sm font-semibold text-gray-300 uppercase tracking-wide">{name}</span>
                </div>
                <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full border ${sc.badge}`}>
                    {param.status}
                </span>
            </div>
            <div className="flex items-baseline gap-1">
                <span className="text-2xl font-bold text-white">{param.value ?? '—'}</span>
                <span className="text-xs text-gray-500 ml-1">Ideal: {param.idealRange}</span>
            </div>
            <p className="text-xs text-gray-400 leading-relaxed">{param.plainExplanation}</p>
            {param.analogy && <p className="text-xs text-cyan-400/70 italic">💡 {param.analogy}</p>}
            {param.healthImpact && <p className="text-xs text-gray-500 leading-relaxed">⚕️ {param.healthImpact}</p>}
        </div>
    );
}

function EffectsTable({ short, long }: { short?: UseCaseEffects; long?: UseCaseEffects }) {
    if (!short && !long) return null;
    const rows: { label: string; icon: string; key: keyof UseCaseEffects }[] = [
        { label: 'Drinking', icon: '🚰', key: 'drinking' },
        { label: 'Cooking', icon: '🍳', key: 'cooking' },
        { label: 'Bathing', icon: '🛁', key: 'bathing' },
        { label: 'Irrigation', icon: '🌱', key: 'irrigation' },
    ];
    return (
        <div className="overflow-x-auto">
            <table className="w-full text-sm">
                <thead>
                    <tr className="border-b border-white/10">
                        <th className="text-left py-2 pr-4 text-xs text-gray-500 uppercase tracking-wider font-semibold w-28">Use</th>
                        <th className="text-left py-2 pr-4 text-xs text-yellow-500/70 uppercase tracking-wider font-semibold">Short-term</th>
                        <th className="text-left py-2 text-xs text-red-500/70 uppercase tracking-wider font-semibold">Long-term</th>
                    </tr>
                </thead>
                <tbody>
                    {rows.map(({ label, icon, key }) => (
                        <tr key={key} className="border-b border-white/5 last:border-0">
                            <td className="py-2.5 pr-4 text-gray-400 whitespace-nowrap">{icon} {label}</td>
                            <td className="py-2.5 pr-4 text-gray-300 text-xs leading-relaxed">{short?.[key] ?? '—'}</td>
                            <td className="py-2.5 text-gray-300 text-xs leading-relaxed">{long?.[key] ?? '—'}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

function TreatmentCards({ treatment }: { treatment?: TreatmentDetail | string[] }) {
    if (!treatment) return null;
    if (Array.isArray(treatment)) {
        return <TagList title="Suggested Treatment" icon="🧬" items={treatment} color="text-cyan-400" />;
    }
    const items = [
        { icon: '🔥', label: 'Boiling', value: treatment.boiling },
        { icon: '🔬', label: 'Filtration', value: treatment.filtration },
        { icon: '💧', label: 'Reverse Osmosis', value: treatment.reverseOsmosis },
        { icon: '🧪', label: 'Chlorination', value: treatment.chlorination },
        { icon: '☀️', label: 'UV Treatment', value: treatment.uvTreatment },
    ].filter((i) => i.value);
    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {items.map(({ icon, label, value }) => (
                <div key={label} className="rounded-xl border border-cyan-500/15 bg-cyan-500/5 p-3">
                    <div className="flex items-center gap-2 mb-1">
                        <span>{icon}</span>
                        <span className="text-xs font-bold text-cyan-400 uppercase tracking-wider">{label}</span>
                    </div>
                    <p className="text-xs text-gray-400 leading-relaxed">{value}</p>
                </div>
            ))}
        </div>
    );
}

function Section({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
    return (
        <div>
            <div className="flex items-center gap-2 mb-3">
                <span>{icon}</span>
                <h3 className="text-sm font-bold text-gray-300 uppercase tracking-widest">{title}</h3>
            </div>
            {children}
        </div>
    );
}

// ── Location bar ──────────────────────────────────────────────────────────────

interface LocationBarProps {
    location: string;
    locating: boolean;
    onChange: (v: string) => void;
    onDetect: () => void;
}

function LocationBar({ location, locating, onChange, onDetect }: LocationBarProps) {
    return (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-white/5 border border-white/10">
            <span className="text-base shrink-0">📍</span>
            <input
                type="text"
                value={location}
                onChange={(e) => onChange(e.target.value)}
                placeholder="Enter city, country…"
                suppressHydrationWarning
                className="flex-1 bg-transparent text-sm text-gray-200 placeholder-gray-600 outline-none"
            />
            <button
                onClick={onDetect}
                disabled={locating}
                title="Detect my location"
                className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border transition-all duration-200 shrink-0
                    ${locating
                        ? 'border-white/10 text-gray-600 cursor-not-allowed'
                        : 'border-cyan-500/40 text-cyan-400 hover:bg-cyan-500/10 cursor-pointer'
                    }`}
            >
                {locating
                    ? <><span className="w-3 h-3 border border-cyan-400/30 border-t-cyan-400 rounded-full animate-spin" />Detecting…</>
                    : <>🎯 Use My Location</>
                }
            </button>
        </div>
    );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function AIAnalysis() {
    const [sensor, setSensor] = useState<SensorData | null>(null);
    const [firebaseKey, setFirebaseKey] = useState<string | null>(null);
    const [result, setResult] = useState<AnalysisResult | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [speaking, setSpeaking] = useState(false);

    // Location state
    const [location, setLocation] = useState('');
    const [locating, setLocating] = useState(false);

    // ── Read sensor data from Firebase (no auto-analysis) ──────────────────
    useEffect(() => {
        const waterRef = query(ref(database, 'water-data'), limitToLast(1));
        const unsubscribe = onValue(waterRef, (snapshot) => {
            if (!snapshot.exists()) return;
            const raw = snapshot.val() as Record<string, LatestEntry>;
            const [key, entry] = Object.entries(raw)[0];
            setFirebaseKey(key);
            setSensor({
                ph: entry.ph, tds: entry.tds, temp: entry.temp,
                turbidity: entry.turbidity, gas: entry.gas,
            });
            // ⚠️ Intentionally NOT loading cached analysis — user must click the button
        });
        return () => unsubscribe();
    }, []);

    // ── Auto-detect location on mount ──────────────────────────────────────
    const detectLocation = useCallback(() => {
        if (!navigator.geolocation) {
            setLocation('Location not supported');
            return;
        }
        setLocating(true);
        navigator.geolocation.getCurrentPosition(
            async ({ coords }) => {
                try {
                    const res = await fetch(
                        `https://nominatim.openstreetmap.org/reverse?lat=${coords.latitude}&lon=${coords.longitude}&format=json&addressdetails=1`,
                        { headers: { 'Accept-Language': 'en' } }
                    );
                    const data = await res.json();
                    const addr = data.address ?? {};

                    // Build precise address: road/suburb + city + state + country
                    const parts = [
                        addr.road ?? addr.pedestrian ?? addr.footway ?? null,
                        addr.suburb ?? addr.neighbourhood ?? addr.hamlet ?? null,
                        addr.city ?? addr.town ?? addr.village ?? addr.county ?? null,
                        addr.state ?? null,
                        addr.country ?? null,
                    ].filter(Boolean) as string[];

                    // Remove duplicate consecutive parts
                    const unique = parts.filter((p, i) => p !== parts[i - 1]);
                    const label = unique.length > 0 ? unique.join(', ') : data.display_name?.slice(0, 80) ?? 'Unknown location';

                    setLocation(label);
                } catch {
                    // Fall back to raw GPS coordinates if reverse geocode fails
                    setLocation(`${coords.latitude.toFixed(6)}, ${coords.longitude.toFixed(6)}`);
                } finally {
                    setLocating(false);
                }
            },
            () => {
                setLocation('');
                setLocating(false);
            },
            {
                enableHighAccuracy: true,   // use GPS chip, not cell/WiFi
                timeout: 15000,  // allow more time for precise fix
                maximumAge: 0,      // never use cached position
            }
        );
    }, []);

    useEffect(() => { detectLocation(); }, [detectLocation]);

    // ── Cleanup speech ──────────────────────────────────────────────────────
    useEffect(() => { return () => { window.speechSynthesis?.cancel(); }; }, []);

    // ── Voice ───────────────────────────────────────────────────────────────
    const speakAnalysis = useCallback(() => {
        if (!result?.overallSummary) return;
        window.speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(result.overallSummary);
        u.rate = 1; u.pitch = 1; u.volume = 1;
        u.onstart = () => setSpeaking(true);
        u.onend = () => setSpeaking(false);
        u.onerror = () => setSpeaking(false);
        if (window.speechSynthesis.paused) window.speechSynthesis.resume();
        window.speechSynthesis.speak(u);
        setTimeout(() => { if (window.speechSynthesis.speaking) setSpeaking(true); }, 200);
    }, [result]);

    const stopSpeech = useCallback(() => {
        window.speechSynthesis.cancel();
        setSpeaking(false);
    }, []);

    // ── Run Gemini analysis ─────────────────────────────────────────────────
    const runAnalysis = useCallback(async () => {
        if (!sensor) return;
        setLoading(true);
        setError(null);
        setResult(null);   // clear previous result — fresh call every time
        try {
            const res = await fetch('/api/analyze', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ph: sensor.ph, tds: sensor.tds, temperature: sensor.temp,
                    turbidity: sensor.turbidity, gas: sensor.gas,
                    firebaseKey,
                    location: location || undefined,
                }),
            });
            if (!res.ok) { const e = await res.json(); throw new Error(e.error ?? 'Unknown error'); }
            setResult(await res.json());
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Analysis failed');
        } finally {
            setLoading(false);
        }
    }, [sensor, firebaseKey, location]);

    const suitabilities = result ? [
        { label: 'Drinking', value: result.drinkingSuitability, icon: '🚰' },
        { label: 'Cooking', value: result.cookingSuitability, icon: '🍳' },
        { label: 'Bathing', value: result.bathingSuitability, icon: '🛁' },
        { label: 'Irrigation', value: result.irrigationSuitability, icon: '🌱' },
    ] : [];

    return (
        <section className="max-w-5xl mx-auto mt-10">

            {/* Voice buttons — only shown when result exists */}
            {result && (
                <div className="flex flex-wrap items-center gap-3 mb-4">
                    <button
                        onClick={speakAnalysis}
                        disabled={speaking}
                        className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200
                            ${speaking ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer hover:scale-105 hover:-translate-y-0.5'}`}
                        style={{
                            background: speaking ? 'rgba(139,92,246,0.3)' : 'linear-gradient(135deg, #7c3aed, #6366f1)',
                            border: '1.5px solid rgba(139,92,246,0.6)',
                            color: '#fff',
                            boxShadow: speaking ? 'none' : '0 4px 20px rgba(99,102,241,0.35)',
                        }}
                    >
                        {speaking
                            ? <><span className="flex gap-0.5 items-end h-4">{[1, 2, 3].map(i => <span key={i} className="w-1 bg-purple-400 rounded-full animate-pulse" style={{ height: `${8 + i * 4}px`, animationDelay: `${i * 0.15}s` }} />)}</span>Speaking…</>
                            : <>🎙 Listen to AI Recommendation</>}
                    </button>
                    <button
                        onClick={stopSpeech}
                        disabled={!speaking}
                        className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200
                            ${!speaking ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer hover:scale-105'}`}
                        style={{
                            background: !speaking ? 'rgba(239,68,68,0.08)' : 'linear-gradient(135deg, #dc2626, #ef4444)',
                            border: '1.5px solid rgba(239,68,68,0.5)',
                            color: !speaking ? '#ef444488' : '#fff',
                            boxShadow: !speaking ? 'none' : '0 4px 20px rgba(239,68,68,0.3)',
                        }}
                    >
                        ⏹ Stop Voice
                    </button>
                </div>
            )}

            {/* Main card */}
            <div className="rounded-2xl border border-cyan-500/20 bg-linear-to-br from-cyan-500/10 to-blue-500/10 backdrop-blur-md bg-white/5 shadow-xl overflow-hidden">

                {/* Header */}
                <div className="flex items-center justify-between px-6 py-5 border-b border-white/5">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-cyan-500/20 border border-cyan-500/30 flex items-center justify-center text-lg">🤖</div>
                        <div>
                            <h2 className="text-lg font-semibold text-cyan-300">AI Analysis</h2>
                            <p className="text-xs text-gray-500 mt-0.5">Powered by Google Gemini · WHO Standards</p>
                        </div>
                    </div>
                    {sensor && (
                        <div className="hidden sm:flex flex-wrap gap-2 justify-end">
                            {[{ l: 'pH', v: sensor.ph }, { l: 'TDS', v: sensor.tds, u: ' ppm' }, { l: 'Temp', v: sensor.temp, u: '°C' }, { l: 'Turb', v: sensor.turbidity, u: ' NTU' }]
                                .map(({ l, v, u = '' }) => v !== undefined ? (
                                    <span key={l} className="text-xs px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-gray-400">
                                        {l}: <span className="text-gray-200 font-medium">{v}{u}</span>
                                    </span>
                                ) : null)}
                        </div>
                    )}
                </div>

                {/* Body */}
                <div className="px-6 py-5 space-y-5">

                    {/* Location bar */}
                    <LocationBar
                        location={location}
                        locating={locating}
                        onChange={setLocation}
                        onDetect={detectLocation}
                    />

                    {/* Run button */}
                    <div className="flex items-center gap-4">
                        <button
                            onClick={runAnalysis}
                            disabled={loading || !sensor}
                            className={`px-6 py-2.5 rounded-xl font-semibold text-sm flex items-center gap-2 transition-all duration-200
                                ${loading || !sensor
                                    ? 'cursor-not-allowed opacity-50'
                                    : 'cursor-pointer hover:scale-105 hover:-translate-y-0.5'}`}
                            style={{
                                background: loading || !sensor
                                    ? 'rgba(6,182,212,0.1)'
                                    : 'linear-gradient(135deg, #0891b2, #06b6d4)',
                                border: '1.5px solid rgba(6,182,212,0.5)',
                                color: loading || !sensor ? '#94a3b8' : '#fff',
                                boxShadow: loading || !sensor ? 'none' : '0 4px 20px rgba(6,182,212,0.3)',
                            }}
                        >
                            {loading
                                ? <><span className="w-4 h-4 border-2 border-cyan-400/30 border-t-cyan-400 rounded-full animate-spin" />Analysing with Gemini…</>
                                : <>✨ {result ? 'Re-run Analysis' : 'Run AI Analysis'}</>}
                        </button>
                        {location && !loading && (
                            <span className="text-xs text-gray-500">📍 {location}</span>
                        )}
                    </div>

                    {/* States */}
                    {error && (
                        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
                            ⚠️ {error}
                        </div>
                    )}
                    {!sensor && !loading && (
                        <p className="text-sm text-gray-600">Waiting for sensor data from Firebase…</p>
                    )}
                    {sensor && !result && !loading && !error && (
                        <p className="text-sm text-gray-500">
                            Click <span className="text-cyan-400 font-medium">Run AI Analysis</span> to get a full WHO-standard water health report for{' '}
                            {location ? <span className="text-gray-300 font-medium">{location}</span> : 'your location'}.
                        </p>
                    )}

                    {/* Results */}
                    {result && (
                        <div className="space-y-8 pt-2">
                            {/* Summary */}
                            <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 px-4 py-4">
                                <p className="text-sm text-gray-300 leading-relaxed">{result.overallSummary}</p>
                            </div>

                            {/* Sensor breakdown */}
                            {result.sensorAnalysis && (
                                <Section title="Sensor Readings vs WHO Standards" icon="📡">
                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                                        <SensorCard name="pH" icon="💧" param={result.sensorAnalysis.ph} />
                                        <SensorCard name="TDS" icon="🧪" param={result.sensorAnalysis.tds} />
                                        <SensorCard name="Temperature" icon="🌡️" param={result.sensorAnalysis.temperature} />
                                        <SensorCard name="Turbidity" icon="🌊" param={result.sensorAnalysis.turbidity} />
                                        <SensorCard name="Gas" icon="💨" param={result.sensorAnalysis.gas} />
                                    </div>
                                </Section>
                            )}

                            {/* Suitability */}
                            <Section title="Use Suitability" icon="✅">
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                    {suitabilities.map(s => <SuitabilityCard key={s.label} {...s} />)}
                                </div>
                            </Section>

                            {/* Effects */}
                            {(result.shortTermEffects || result.longTermEffects) && (
                                <Section title="Health Effects by Use" icon="📋">
                                    <EffectsTable short={result.shortTermEffects} long={result.longTermEffects} />
                                </Section>
                            )}

                            {/* Diseases */}
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                                <TagList title="Possible Diseases" icon="🦠" items={result.possibleDiseases} color="text-red-400" />
                                <TagList title="Skin Conditions" icon="🧴" items={result.possibleSkinDiseases} color="text-orange-400" />
                                <TagList title="Waterborne Diseases" icon="💧" items={result.waterborneDiseasees} color="text-yellow-400" />
                            </div>

                            {/* Issues */}
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                                <TagList title="Issues Detected" icon="🔍" items={result.issuesDetected} color="text-yellow-400" />
                                <TagList title="Health Risks" icon="⚠️" items={result.healthRisks} color="text-red-400" />
                                <TagList title="Precautions" icon="🛡️" items={result.precautions} color="text-blue-400" />
                            </div>

                            {/* Treatment */}
                            <Section title="Treatment Recommendations" icon="🧬">
                                <TreatmentCards treatment={result.suggestedTreatment} />
                            </Section>
                        </div>
                    )}
                </div>
            </div>
        </section>
    );
}
