'use client';

import { useState, useRef, useCallback, useEffect } from 'react';

// ── Types — supports both old and new API response schemas ────────────────────

interface VisualAnalysis {
    // New schema
    clarity?: string;
    colour?: string;
    algae?: string;
    foam?: string;
    oilLayer?: string;
    sediment?: string;
    visibleContamination?: string;
    // Old schema (kept for compatibility)
    color?: string;
    cloudiness?: string;
    suspendedParticles?: string;
    rust?: string;
    overallVisual?: string;
}

interface SensorAnalysis {
    ph?: string;
    tds?: string;
    turbidity?: string;
    temperature?: string;
    gas?: string;
    wqi?: string;
    grade?: string;
}

interface ImageAnalysisResult {
    visualAnalysis: VisualAnalysis;
    // New schema
    summary?: string;
    // Old schema
    combinedAssessment?: string;
    sensorAnalysis?: SensorAnalysis;
    recommendations: string[];
    confidence: string;
    healthRisk?: string;   // optional — absent in new schema
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function riskColor(risk?: string) {
    const r = (risk ?? '').toLowerCase();
    if (r === 'none' || r === 'low') return { bg: 'bg-green-500/10', text: 'text-green-400', border: 'border-green-500/25' };
    if (r === 'moderate') return { bg: 'bg-yellow-500/10', text: 'text-yellow-400', border: 'border-yellow-500/25' };
    if (r === 'high' || r === 'critical') return { bg: 'bg-red-500/10', text: 'text-red-400', border: 'border-red-500/25' };
    return { bg: 'bg-gray-500/10', text: 'text-gray-400', border: 'border-gray-500/25' };
}

function confidenceColor(c?: string) {
    if (c === 'High') return 'text-green-400';
    if (c === 'Medium') return 'text-yellow-400';
    return 'text-red-400';
}

function VisualRow({ label, value }: { label: string; value?: string }) {
    if (!value || value === 'N/A' || value.toLowerCase() === 'none') return null;
    return (
        <div className="flex items-start justify-between gap-4 py-2 border-b border-white/5 last:border-0">
            <span className="text-xs text-gray-500 uppercase tracking-wide shrink-0 w-36">{label}</span>
            <span className="text-sm text-gray-300 text-right leading-relaxed">{value}</span>
        </div>
    );
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function Sk({ h = 'h-4', w = 'w-full' }: { h?: string; w?: string }) {
    return <div className={`${h} ${w} rounded-lg bg-white/8 animate-pulse`} />;
}

function AnalysisSkeleton() {
    return (
        <div className="space-y-6 mt-6">
            <div className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-3">
                <Sk h="h-4" w="w-1/3" /><Sk /><Sk w="w-5/6" /><Sk w="w-4/5" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {[0, 1].map((i) => (
                    <div key={i} className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-2">
                        <Sk h="h-4" w="w-1/2" /><Sk /><Sk w="w-4/5" />
                    </div>
                ))}
            </div>
        </div>
    );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function VisualWaterInspector() {
    const [imagePreview, setImagePreview] = useState<string | null>(null);
    const [imageMime, setImageMime] = useState('image/jpeg');
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<ImageAnalysisResult | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [showWebcam, setShowWebcam] = useState(false);
    const [stream, setStream] = useState<MediaStream | null>(null);

    const fileInputRef = useRef<HTMLInputElement>(null);
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const dropZoneRef = useRef<HTMLDivElement>(null);

    useEffect(() => { return () => { stream?.getTracks().forEach((t) => t.stop()); }; }, [stream]);

    useEffect(() => {
        if (videoRef.current && stream) videoRef.current.srcObject = stream;
    }, [stream, showWebcam]);

    const handleFile = useCallback((file: File) => {
        if (!file.type.startsWith('image/')) { setError('Please upload a valid image file (JPG, PNG, or WEBP).'); return; }
        setImageMime(file.type); setResult(null); setError(null);
        const reader = new FileReader();
        reader.onload = (e) => setImagePreview(e.target?.result as string);
        reader.readAsDataURL(file);
    }, []);

    const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => { const f = e.target.files?.[0]; if (f) handleFile(f); };

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) handleFile(f);
    }, [handleFile]);

    const openWebcam = async () => {
        try {
            const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
            setStream(s); setShowWebcam(true); setResult(null); setError(null);
        } catch { setError('Could not access camera. Please allow camera permissions or upload an image.'); }
    };

    const closeWebcam = () => { stream?.getTracks().forEach((t) => t.stop()); setStream(null); setShowWebcam(false); };

    const capturePhoto = () => {
        if (!videoRef.current || !canvasRef.current) return;
        const v = videoRef.current; const c = canvasRef.current;
        c.width = v.videoWidth; c.height = v.videoHeight;
        c.getContext('2d')?.drawImage(v, 0, 0);
        setImagePreview(c.toDataURL('image/jpeg', 0.9)); setImageMime('image/jpeg'); closeWebcam();
    };

    const analyseImage = useCallback(async () => {
        if (!imagePreview || loading) return;
        setLoading(true); setError(null); setResult(null);
        try {
            const base64 = imagePreview.split(',')[1];
            const res = await fetch('/api/image-analysis', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ imageBase64: base64, mimeType: imageMime }),
            });
            const data = await res.json();
            if (!res.ok || data.error) throw new Error(data.error ?? 'Analysis failed.');
            setResult(data as ImageAnalysisResult);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Analysis failed. Please try again.');
        } finally { setLoading(false); }
    }, [imagePreview, imageMime, loading]);

    const clearAll = () => {
        setImagePreview(null); setResult(null); setError(null); closeWebcam();
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const rc = result ? riskColor(result.healthRisk) : null;
    const summaryText = result?.summary ?? result?.combinedAssessment ?? '';
    const va = result?.visualAnalysis;

    return (
        <section className="max-w-5xl mx-auto mt-12" id="visual-inspector">

            {/* Header */}
            <div className="flex items-center gap-3 mb-6">
                <div className="w-9 h-9 rounded-full bg-violet-500/20 border border-violet-500/30 flex items-center justify-center text-lg">🔬</div>
                <div>
                    <h2 className="text-xl font-semibold text-white">AI Visual Water Inspector</h2>
                    <p className="text-xs text-gray-500 mt-0.5">Upload or capture a water sample image for AI visual analysis</p>
                </div>
                {imagePreview && (
                    <button onClick={clearAll}
                        className="ml-auto text-xs px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-gray-500 hover:text-gray-300 hover:bg-white/10 transition-all cursor-pointer">
                        🗑 Clear
                    </button>
                )}
            </div>

            <div className="rounded-2xl border border-violet-500/20 bg-white/5 backdrop-blur-md shadow-xl overflow-hidden">
                <div className="p-6 space-y-6">

                    {/* Upload / Webcam */}
                    {!showWebcam && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div ref={dropZoneRef} onClick={() => fileInputRef.current?.click()}
                                onDrop={handleDrop} onDragOver={(e) => e.preventDefault()}
                                className="rounded-xl border-2 border-dashed border-violet-500/30 bg-violet-500/5 hover:border-violet-500/60 hover:bg-violet-500/10 transition-all cursor-pointer flex flex-col items-center justify-center gap-3 p-8 min-h-[140px]">
                                <span className="text-3xl">📁</span>
                                <div className="text-center">
                                    <p className="text-sm font-semibold text-gray-300">Upload Image</p>
                                    <p className="text-xs text-gray-600 mt-1">JPG, PNG or WEBP · drag & drop or click</p>
                                </div>
                                <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={handleFileInput} />
                            </div>
                            <button onClick={openWebcam}
                                className="rounded-xl border-2 border-dashed border-cyan-500/30 bg-cyan-500/5 hover:border-cyan-500/60 hover:bg-cyan-500/10 transition-all cursor-pointer flex flex-col items-center justify-center gap-3 p-8 min-h-[140px]">
                                <span className="text-3xl">📷</span>
                                <div className="text-center">
                                    <p className="text-sm font-semibold text-gray-300">Use Camera</p>
                                    <p className="text-xs text-gray-600 mt-1">Capture water sample in real time</p>
                                </div>
                            </button>
                        </div>
                    )}

                    {/* Webcam */}
                    {showWebcam && (
                        <div className="space-y-3">
                            <div className="rounded-xl overflow-hidden border border-cyan-500/20 bg-black aspect-video relative">
                                <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
                                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                    <div className="w-48 h-48 border-2 border-cyan-400/40 rounded-2xl" />
                                </div>
                            </div>
                            <canvas ref={canvasRef} hidden />
                            <div className="flex gap-3">
                                <button onClick={capturePhoto}
                                    className="flex-1 py-3 rounded-xl text-sm font-semibold text-white cursor-pointer hover:scale-[1.01] transition-all"
                                    style={{ background: 'linear-gradient(135deg,#0891b2,#06b6d4)', boxShadow: '0 4px 16px rgba(6,182,212,0.3)' }}>
                                    📸 Capture Photo
                                </button>
                                <button onClick={closeWebcam}
                                    className="px-5 py-3 rounded-xl text-sm font-semibold text-gray-400 border border-white/10 bg-white/5 hover:bg-white/10 cursor-pointer transition-all">
                                    Cancel
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Preview + Analyse */}
                    {imagePreview && !showWebcam && (
                        <div className="space-y-4">
                            <div className="rounded-xl overflow-hidden border border-white/10 bg-black/20 relative">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={imagePreview} alt="Water sample" className="w-full max-h-72 object-contain" />
                                <div className="absolute top-3 right-3 bg-black/60 rounded-lg px-2 py-1 text-xs text-gray-300">Water sample</div>
                            </div>
                            <button onClick={analyseImage} disabled={loading}
                                className={`w-full py-3 rounded-xl text-sm font-semibold text-white transition-all duration-200 ${loading ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:scale-[1.01]'}`}
                                style={{ background: loading ? 'rgba(139,92,246,0.3)' : 'linear-gradient(135deg,#7c3aed,#6366f1)', boxShadow: loading ? 'none' : '0 4px 20px rgba(99,102,241,0.4)' }}>
                                {loading
                                    ? <span className="flex items-center justify-center gap-2"><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Analysing water sample…</span>
                                    : <>🔬 {result ? 'Re-analyse' : 'Analyse Water Sample'}</>}
                            </button>
                        </div>
                    )}

                    {/* Error */}
                    {error && (
                        <div className="rounded-xl border border-red-500/25 bg-red-500/8 px-4 py-3 text-sm text-red-400 flex items-start gap-2">
                            <span className="shrink-0 mt-0.5">⚠️</span><span>{error}</span>
                        </div>
                    )}

                    {/* Skeleton */}
                    {loading && <AnalysisSkeleton />}

                    {/* Results */}
                    {result && !loading && (
                        <div className="space-y-6 pt-2 border-t border-white/10">

                            {/* Badges */}
                            <div className="flex flex-wrap gap-3">
                                {result.healthRisk && (
                                    <div className={`flex items-center gap-2 px-4 py-2 rounded-xl border ${rc?.border} ${rc?.bg}`}>
                                        <span className="text-sm">⚠️</span>
                                        <span className={`text-sm font-bold ${rc?.text}`}>Health Risk: {result.healthRisk}</span>
                                    </div>
                                )}
                                <div className="flex items-center gap-2 px-4 py-2 rounded-xl border border-white/10 bg-white/5">
                                    <span className="text-sm">🎯</span>
                                    <span className={`text-sm font-bold ${confidenceColor(result.confidence)}`}>
                                        Confidence: {result.confidence ?? '—'}
                                    </span>
                                </div>
                            </div>

                            {/* Summary */}
                            {summaryText && (
                                <div className="rounded-xl border border-violet-500/20 bg-violet-500/5 p-4">
                                    <div className="flex items-center gap-2 mb-2">
                                        <span className="text-lg">🧠</span>
                                        <h3 className="text-sm font-bold text-gray-300 uppercase tracking-widest">Analysis Summary</h3>
                                    </div>
                                    <p className="text-sm text-gray-200 leading-relaxed">{summaryText}</p>
                                </div>
                            )}

                            {/* Visual Findings */}
                            {va && (
                                <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-4">
                                    <div className="flex items-center gap-2 mb-3">
                                        <span className="text-lg">👁</span>
                                        <h3 className="text-sm font-bold text-gray-300 uppercase tracking-widest">Visual Findings</h3>
                                    </div>
                                    {va.overallVisual && (
                                        <div className="mb-3 p-3 rounded-lg bg-white/5">
                                            <p className="text-sm text-gray-200 leading-relaxed">{va.overallVisual}</p>
                                        </div>
                                    )}
                                    <div className="space-y-0">
                                        <VisualRow label="Colour" value={va.colour ?? va.color} />
                                        <VisualRow label="Clarity" value={va.clarity} />
                                        <VisualRow label="Cloudiness" value={va.cloudiness} />
                                        <VisualRow label="Foam" value={va.foam} />
                                        <VisualRow label="Oil Layer" value={va.oilLayer} />
                                        <VisualRow label="Algae" value={va.algae} />
                                        <VisualRow label="Rust" value={va.rust} />
                                        <VisualRow label="Sediment" value={va.sediment} />
                                        <VisualRow label="Particles" value={va.suspendedParticles} />
                                        <VisualRow label="Contamination" value={va.visibleContamination} />
                                    </div>
                                </div>
                            )}

                            {/* Sensor Findings */}
                            {result.sensorAnalysis && (
                                <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4">
                                    <div className="flex items-center gap-2 mb-3">
                                        <span className="text-lg">📡</span>
                                        <h3 className="text-sm font-bold text-gray-300 uppercase tracking-widest">Sensor Findings</h3>
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        {[
                                            { icon: '💧', label: 'pH', val: result.sensorAnalysis.ph },
                                            { icon: '🧪', label: 'TDS', val: result.sensorAnalysis.tds },
                                            { icon: '🌊', label: 'Turbidity', val: result.sensorAnalysis.turbidity },
                                            { icon: '🌡️', label: 'Temperature', val: result.sensorAnalysis.temperature },
                                            { icon: '💨', label: 'Gas', val: result.sensorAnalysis.gas },
                                            { icon: '📊', label: 'WQI', val: result.sensorAnalysis.wqi },
                                        ].filter((i) => i.val && i.val !== 'N/A').map(({ icon, label, val }) => (
                                            <div key={label} className="rounded-lg bg-white/5 px-3 py-2.5">
                                                <div className="flex items-center gap-1.5 mb-1">
                                                    <span className="text-sm">{icon}</span>
                                                    <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">{label}</span>
                                                </div>
                                                <p className="text-xs text-gray-300 leading-relaxed">{val}</p>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Recommendations */}
                            {result.recommendations?.length > 0 && (
                                <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
                                    <div className="flex items-center gap-2 mb-3">
                                        <span className="text-lg">💡</span>
                                        <h3 className="text-sm font-bold text-gray-300 uppercase tracking-widest">Recommendations</h3>
                                    </div>
                                    <ul className="space-y-2">
                                        {result.recommendations.map((r, i) => (
                                            <li key={i} className="flex items-start gap-2 text-sm text-gray-300">
                                                <span className="text-emerald-400 mt-0.5 shrink-0">▸</span>
                                                <span>{r}</span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}

                        </div>
                    )}
                </div>
            </div>
        </section>
    );
}
