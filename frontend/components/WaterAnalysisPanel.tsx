'use client';

import { useState, useCallback, useRef } from 'react';
import { useLanguage, LANG_OPTIONS, AppLanguage } from '@/lib/languageContext';

// ── Types ─────────────────────────────────────────────────────────────────────

interface WaterAnalysis {
    summary: string;
    pros: string[];
    cons: string[];
    parameters: {
        ph: string;
        tds: string;
        turbidity: string;
        temperature: string;
        gas: string;
    };
    whoComparison: string;
    healthRisks: string[];
    recommendations: string[];
    filtration: string;
    simpleExplanation: string;
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function Sk({ h = 'h-4', w = 'w-full' }: { h?: string; w?: string }) {
    return <div className={`${h} ${w} rounded-lg bg-white/8 animate-pulse`} />;
}
function FullSkeleton() {
    return (
        <div className="space-y-8 px-6 py-6">
            <div className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-2">
                <Sk h="h-4" w="w-1/4" /><Sk /><Sk w="w-5/6" /><Sk w="w-3/4" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {[0, 1].map(i => <div key={i} className="space-y-3"><Sk h="h-5" w="w-1/3" /><Sk /><Sk w="w-5/6" /></div>)}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {[...Array(5)].map((_, i) => <div key={i} className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-2"><Sk h="h-4" w="w-1/2" /><Sk /></div>)}
            </div>
            <div className="space-y-3"><Sk h="h-5" w="w-1/3" /><Sk /><Sk w="w-4/5" /></div>
        </div>
    );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SH({ emoji, title }: { emoji: string; title: string }) {
    return (
        <div className="flex items-center gap-2 mb-3">
            <span className="text-lg">{emoji}</span>
            <h3 className="text-sm font-bold text-gray-300 uppercase tracking-widest">{title}</h3>
        </div>
    );
}

function BulletList({ items, icon, color }: { items: string[]; icon: string; color: string }) {
    if (!items?.length) return <p className="text-sm text-gray-600 italic">None reported.</p>;
    return (
        <ul className="space-y-2">
            {items.map((item, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-gray-300">
                    <span className={`mt-0.5 shrink-0 ${color}`}>{icon}</span>
                    <span>{item || '—'}</span>
                </li>
            ))}
        </ul>
    );
}

function ParamCard({ icon, label, text }: { icon: string; label: string; text: string }) {
    return (
        <div className="rounded-xl border border-white/10 bg-white/5 p-4 flex flex-col gap-2 hover:bg-white/8 transition-colors">
            <div className="flex items-center gap-2">
                <span className="text-lg">{icon}</span>
                <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">{label}</span>
            </div>
            <p className="text-sm text-gray-300 leading-relaxed">{text || '—'}</p>
        </div>
    );
}

function RiskCard({ text }: { text: string }) {
    return (
        <div className="flex items-start gap-3 rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3">
            <span className="text-amber-400 mt-0.5 shrink-0">⚠️</span>
            <p className="text-sm text-gray-300 leading-relaxed">{text || '—'}</p>
        </div>
    );
}

// ── "Explain More" follow-up chips ────────────────────────────────────────────

const EXPLAIN_TOPICS = [
    { label: '📖 Explain More', msg: 'Please explain the overall water quality in more detail.' },
    { label: '⚠️ Health Risks', msg: 'What are the specific health risks associated with these water readings?' },
    { label: '🌍 WHO Standards', msg: 'How do my readings compare to WHO drinking water standards?' },
    { label: '🔬 Best Filtration', msg: 'What is the best filtration method for my specific water readings and why?' },
    { label: '🧬 Scientific Reason', msg: 'Explain the scientific reasoning behind this water quality assessment.' },
];

// ── Voice helper ──────────────────────────────────────────────────────────────

function buildSpeechText(a: WaterAnalysis): string {
    return [
        a.summary,
        a.pros?.join('. '),
        a.whoComparison,
        a.simpleExplanation,
    ].filter(Boolean).join('. ');
}

function getVoiceForLang(bcp47: string): SpeechSynthesisVoice | null {
    const voices = window.speechSynthesis.getVoices();
    return (
        voices.find((v) => v.lang === bcp47) ??
        voices.find((v) => v.lang.startsWith(bcp47.split('-')[0])) ??
        null
    );
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
    /** Called when user clicks an "Explain More" chip — scrolls to chat and pre-fills message */
    onExplainRequest?: (msg: string) => void;
}

export default function WaterAnalysisPanel({ onExplainRequest }: Props) {
    const { language, setLanguage, langOption } = useLanguage();

    // Master analysis — always English
    const [masterAnalysis, setMasterAnalysis] = useState<WaterAnalysis | null>(null);
    // Displayed analysis — translated version of master
    const [displayAnalysis, setDisplayAnalysis] = useState<WaterAnalysis | null>(null);
    // Cache of translations keyed by language
    const translationCache = useRef<Partial<Record<AppLanguage, WaterAnalysis>>>({});

    const [loading, setLoading] = useState(false);
    const [translating, setTranslating] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [speaking, setSpeaking] = useState(false);

    // ── Translate master to target language ─────────────────────────────────

    const translateTo = useCallback(async (lang: AppLanguage, master: WaterAnalysis) => {
        if (lang === 'english') {
            setDisplayAnalysis(master);
            return;
        }
        // Return cached translation if available
        if (translationCache.current[lang]) {
            setDisplayAnalysis(translationCache.current[lang]!);
            return;
        }
        setTranslating(true);
        try {
            const res = await fetch('/api/translate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ analysis: master, language: lang }),
            });
            const data = await res.json();
            if (!res.ok || data.error) throw new Error(data.error ?? 'Translation failed.');
            translationCache.current[lang] = data as WaterAnalysis;
            setDisplayAnalysis(data as WaterAnalysis);
        } catch {
            // Fall back to English on translation failure
            setDisplayAnalysis(master);
        } finally {
            setTranslating(false);
        }
    }, []);

    // ── Fetch fresh analysis (always English) ────────────────────────────────

    const fetchAnalysis = useCallback(async () => {
        if (loading) return;
        setLoading(true);
        setError(null);
        translationCache.current = {};   // clear cache on refresh

        try {
            const res = await fetch('/api/water-analysis', { method: 'POST' });
            const data = await res.json();
            if (!res.ok || data.error) throw new Error(data.error ?? 'Analysis failed. Please try again.');
            const master = data as WaterAnalysis;
            setMasterAnalysis(master);
            await translateTo(language, master);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Analysis failed. Please try again.');
        } finally {
            setLoading(false);
        }
    }, [loading, language, translateTo]);

    // ── Handle language switch ───────────────────────────────────────────────

    const handleLangSwitch = useCallback(async (lang: AppLanguage) => {
        setLanguage(lang);
        if (masterAnalysis) await translateTo(lang, masterAnalysis);
    }, [masterAnalysis, setLanguage, translateTo]);

    // ── Voice ────────────────────────────────────────────────────────────────

    const speakAnalysis = useCallback(() => {
        if (!displayAnalysis) return;
        window.speechSynthesis.cancel();
        const text = buildSpeechText(displayAnalysis);
        const u = new SpeechSynthesisUtterance(text);

        // Load voices (Chrome requires a small delay)
        const assignVoice = () => {
            const voice = getVoiceForLang(langOption.bcp47);
            if (voice) u.voice = voice;
            else u.lang = langOption.bcp47;   // fallback: let browser pick
        };
        assignVoice();
        if (!window.speechSynthesis.getVoices().length) {
            window.speechSynthesis.onvoiceschanged = assignVoice;
        }

        u.rate = 1; u.pitch = 1; u.volume = 1;
        u.onstart = () => setSpeaking(true);
        u.onend = () => setSpeaking(false);
        u.onerror = () => setSpeaking(false);
        if (window.speechSynthesis.paused) window.speechSynthesis.resume();
        window.speechSynthesis.speak(u);
        setTimeout(() => { if (window.speechSynthesis.speaking) setSpeaking(true); }, 200);
    }, [displayAnalysis, langOption]);

    const stopSpeech = useCallback(() => {
        window.speechSynthesis.cancel();
        setSpeaking(false);
    }, []);

    const a = displayAnalysis;

    return (
        <section className="max-w-5xl mx-auto mt-12" id="water-analysis">

            {/* Section header */}
            <div className="flex flex-wrap items-center gap-3 mb-6">
                <div className="w-9 h-9 rounded-full bg-cyan-500/20 border border-cyan-500/30 flex items-center justify-center text-lg">🧠</div>
                <div>
                    <h2 className="text-xl font-semibold text-white">AI Water Analysis</h2>
                    <p className="text-xs text-gray-500 mt-0.5">Click to generate · Powered by Gemini</p>
                </div>

                {/* Generate / Refresh button */}
                <button
                    onClick={fetchAnalysis}
                    disabled={loading}
                    className={`ml-auto flex items-center gap-2 text-xs font-semibold px-4 py-2 rounded-xl border transition-all duration-200
                        ${loading ? 'border-white/10 text-gray-600 cursor-not-allowed opacity-60'
                            : 'border-cyan-500/35 text-cyan-400 hover:bg-cyan-500/10 cursor-pointer'}`}
                >
                    {loading
                        ? <><span className="w-3 h-3 border border-cyan-400/30 border-t-cyan-400 rounded-full animate-spin" />Analysing…</>
                        : <>{a ? '🔄 Refresh' : '✨ Generate Analysis'}</>}
                </button>
            </div>

            {/* Main card */}
            <div className="rounded-2xl border border-cyan-500/20 bg-white/5 backdrop-blur-md shadow-xl overflow-hidden">

                {loading && !a && <FullSkeleton />}

                {error && !loading && (
                    <div className="px-6 py-10 flex flex-col items-center gap-4 text-center">
                        <span className="text-4xl">⚠️</span>
                        <p className="text-gray-400 text-sm max-w-sm">{error}</p>
                        <button onClick={fetchAnalysis} disabled={loading}
                            className={`px-6 py-2.5 rounded-xl text-sm font-semibold text-white transition-all duration-200
                                ${loading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:scale-105'}`}
                            style={{ background: 'linear-gradient(135deg,#0891b2,#06b6d4)', boxShadow: '0 4px 16px rgba(6,182,212,0.3)' }}>
                            {loading ? '…' : '🔁 Retry Analysis'}
                        </button>
                    </div>
                )}

                {!loading && !error && !a && (
                    <div className="px-6 py-16 flex flex-col items-center gap-4 text-center">
                        <span className="text-5xl">🧠</span>
                        <p className="text-gray-400 text-sm max-w-xs leading-relaxed">
                            Click <span className="text-cyan-400 font-semibold">✨ Generate Analysis</span> to run a full AI water quality report using live sensor data and WHO standards.
                        </p>
                    </div>
                )}

                {a && (
                    <div className="relative px-6 py-6 space-y-8">

                        {/* Overlay during refresh or translation */}
                        {(loading || translating) && (
                            <div className="absolute inset-0 bg-gray-950/60 rounded-2xl flex items-center justify-center z-10">
                                <div className="flex flex-col items-center gap-2">
                                    <span className="w-8 h-8 border-2 border-cyan-400/30 border-t-cyan-400 rounded-full animate-spin" />
                                    {translating && <span className="text-xs text-gray-400">Translating…</span>}
                                </div>
                            </div>
                        )}

                        {/* ── Voice + Language controls ── */}
                        <div className="flex flex-wrap items-center gap-3 pb-4 border-b border-white/10">
                            {/* Voice buttons */}
                            <button onClick={speakAnalysis} disabled={speaking}
                                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all duration-200
                                    ${speaking ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer hover:scale-105'}`}
                                style={{
                                    background: speaking ? 'rgba(139,92,246,0.2)' : 'linear-gradient(135deg,#7c3aed,#6366f1)',
                                    border: '1.5px solid rgba(139,92,246,0.5)',
                                    color: '#fff',
                                }}>
                                {speaking
                                    ? <><span className="flex gap-0.5 items-end h-3">{[1, 2, 3].map(i => <span key={i} className="w-1 bg-purple-300 rounded-full animate-pulse" style={{ height: `${4 + i * 3}px`, animationDelay: `${i * 0.15}s` }} />)}</span>Speaking…</>
                                    : <>🎙 Listen</>}
                            </button>
                            <button onClick={stopSpeech} disabled={!speaking}
                                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all duration-200
                                    ${!speaking ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer hover:scale-105'}`}
                                style={{
                                    background: !speaking ? 'rgba(239,68,68,0.05)' : 'linear-gradient(135deg,#dc2626,#ef4444)',
                                    border: '1.5px solid rgba(239,68,68,0.4)',
                                    color: !speaking ? '#ef444488' : '#fff',
                                }}>
                                ⏹ Stop
                            </button>

                            {/* Language switcher — translates without re-fetching */}
                            <div className="ml-auto flex items-center gap-2">
                                <span className="text-xs text-gray-500">View in:</span>
                                {LANG_OPTIONS.map((opt) => (
                                    <button key={opt.value}
                                        onClick={() => handleLangSwitch(opt.value as AppLanguage)}
                                        disabled={translating}
                                        className={`text-xs px-3 py-1.5 rounded-full border transition-all duration-150 cursor-pointer
                                            ${language === opt.value
                                                ? 'border-cyan-500/60 bg-cyan-500/15 text-cyan-300'
                                                : 'border-white/15 text-gray-400 hover:border-cyan-500/30'}`}>
                                        {opt.flag} {opt.native}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* 1. Summary */}
                        <div>
                            <SH emoji="🟢" title="Overall Water Quality Summary" />
                            <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 px-4 py-4">
                                <p className="text-sm text-gray-200 leading-relaxed">{a.summary || '—'}</p>
                            </div>
                        </div>

                        {/* 2. Pros & Cons */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                            <div className="rounded-xl border border-green-500/20 bg-green-500/5 p-4">
                                <SH emoji="✅" title="Pros" />
                                <BulletList items={a.pros} icon="✓" color="text-green-400" />
                            </div>
                            <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4">
                                <SH emoji="❌" title="Cons" />
                                <BulletList items={a.cons} icon="✗" color="text-red-400" />
                            </div>
                        </div>

                        {/* 3. Parameters */}
                        <div>
                            <SH emoji="📊" title="Parameter Analysis" />
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                <ParamCard icon="💧" label="pH" text={a.parameters?.ph ?? '—'} />
                                <ParamCard icon="🧪" label="TDS" text={a.parameters?.tds ?? '—'} />
                                <ParamCard icon="🌊" label="Turbidity" text={a.parameters?.turbidity ?? '—'} />
                                <ParamCard icon="🌡️" label="Temperature" text={a.parameters?.temperature ?? '—'} />
                                <ParamCard icon="💨" label="Gas Level" text={a.parameters?.gas ?? '—'} />
                            </div>
                        </div>

                        {/* 4. WHO Comparison */}
                        <div>
                            <SH emoji="🌍" title="WHO Standards Comparison" />
                            <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 px-4 py-4">
                                <p className="text-sm text-gray-300 leading-relaxed whitespace-pre-line">{a.whoComparison || '—'}</p>
                            </div>
                        </div>

                        {/* 5. Health Risks */}
                        <div>
                            <SH emoji="⚠️" title="Possible Health Risks" />
                            <div className="space-y-2">
                                {a.healthRisks?.length
                                    ? a.healthRisks.map((r, i) => <RiskCard key={i} text={r} />)
                                    : <p className="text-sm text-gray-600 italic">No significant health risks detected.</p>}
                            </div>
                        </div>

                        {/* 6. Recommendations */}
                        <div>
                            <SH emoji="💧" title="Recommendations" />
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div className="rounded-xl border border-purple-500/20 bg-purple-500/5 p-4">
                                    <p className="text-xs font-bold text-purple-400 uppercase tracking-wider mb-3">🛡️ Preventive Measures</p>
                                    <BulletList items={a.recommendations} icon="▸" color="text-purple-400" />
                                </div>
                                <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-4">
                                    <p className="text-xs font-bold text-cyan-400 uppercase tracking-wider mb-3">🔬 Recommended Filtration</p>
                                    <p className="text-sm text-gray-300 leading-relaxed">{a.filtration || '—'}</p>
                                </div>
                            </div>
                        </div>

                        {/* 7. Simple Explanation */}
                        <div>
                            <SH emoji="🙂" title="Simple Explanation" />
                            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-4 flex gap-3">
                                <span className="text-2xl shrink-0">💬</span>
                                <p className="text-sm text-gray-200 leading-relaxed italic">&ldquo;{a.simpleExplanation || '—'}&rdquo;</p>
                            </div>
                        </div>

                        {/* 8. Explain More chips */}
                        {onExplainRequest && (
                            <div>
                                <p className="text-xs text-gray-500 font-semibold uppercase tracking-wider mb-3">Ask AI to explain:</p>
                                <div className="flex flex-wrap gap-2">
                                    {EXPLAIN_TOPICS.map((t) => (
                                        <button key={t.label}
                                            onClick={() => onExplainRequest(t.msg)}
                                            className="text-xs px-3 py-1.5 rounded-full border border-cyan-500/25 bg-cyan-500/8 text-cyan-400 hover:bg-cyan-500/18 hover:border-cyan-500/45 transition-all duration-150 cursor-pointer">
                                            {t.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                    </div>
                )}
            </div>
        </section>
    );
}
