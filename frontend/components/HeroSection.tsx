'use client';

import { useEffect, useRef, useState } from 'react';

// ── Animated particles canvas (light theme) ───────────────────────────────────

function ParticlesBg() {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d')!;

        let W = (canvas.width = window.innerWidth);
        let H = (canvas.height = window.innerHeight);

        const pts = Array.from({ length: 60 }, () => ({
            x: Math.random() * W,
            y: Math.random() * H,
            vx: (Math.random() - 0.5) * 0.4,
            vy: (Math.random() - 0.5) * 0.4,
            r: Math.random() * 2.5 + 1,
            op: Math.random() * 0.4 + 0.1,
        }));

        let raf: number;

        const draw = () => {
            ctx.clearRect(0, 0, W, H);

            pts.forEach((p) => {
                p.x += p.vx;
                p.y += p.vy;
                if (p.x < 0 || p.x > W) p.vx *= -1;
                if (p.y < 0 || p.y > H) p.vy *= -1;

                ctx.beginPath();
                ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(14,165,233,${p.op})`;
                ctx.fill();
            });

            // connection lines
            pts.forEach((a, i) =>
                pts.slice(i + 1).forEach((b) => {
                    const d = Math.hypot(a.x - b.x, a.y - b.y);
                    if (d < 120) {
                        ctx.beginPath();
                        ctx.moveTo(a.x, a.y);
                        ctx.lineTo(b.x, b.y);
                        ctx.strokeStyle = `rgba(14,165,233,${0.08 * (1 - d / 120)})`;
                        ctx.lineWidth = 0.8;
                        ctx.stroke();
                    }
                })
            );

            raf = requestAnimationFrame(draw);
        };

        draw();

        const onResize = () => {
            W = canvas.width = window.innerWidth;
            H = canvas.height = window.innerHeight;
        };
        window.addEventListener('resize', onResize);
        return () => {
            cancelAnimationFrame(raf);
            window.removeEventListener('resize', onResize);
        };
    }, []);

    return (
        <canvas
            ref={canvasRef}
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                pointerEvents: 'none',
                zIndex: 0,
                opacity: 0.6,
            }}
        />
    );
}

// ── Wave transition ───────────────────────────────────────────────────────────

function WaveBottom() {
    return (
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, overflow: 'hidden', lineHeight: 0 }}>
            <svg
                viewBox="0 0 1440 80"
                xmlns="http://www.w3.org/2000/svg"
                style={{ display: 'block', width: '100%' }}
            >
                <defs>
                    <style>{`
            @keyframes wave1 {
              0%   { d: path("M0,40 C240,80 480,0 720,40 C960,80 1200,0 1440,40 L1440,80 L0,80 Z"); }
              50%  { d: path("M0,40 C240,0 480,80 720,40 C960,0 1200,80 1440,40 L1440,80 L0,80 Z"); }
              100% { d: path("M0,40 C240,80 480,0 720,40 C960,80 1200,0 1440,40 L1440,80 L0,80 Z"); }
            }
          `}</style>
                </defs>
                <path
                    fill="rgba(240,244,248,1)"
                    style={{ animation: 'wave1 6s ease-in-out infinite' }}
                    d="M0,40 C240,80 480,0 720,40 C960,80 1200,0 1440,40 L1440,80 L0,80 Z"
                />
            </svg>
        </div>
    );
}

// ── Sticky nav ────────────────────────────────────────────────────────────────

function StickyNav() {
    const [scrolled, setScrolled] = useState(false);

    useEffect(() => {
        const handler = () => setScrolled(window.scrollY > 60);
        window.addEventListener('scroll', handler);
        return () => window.removeEventListener('scroll', handler);
    }, []);

    const links = [
        { label: 'Dashboard', href: '#dashboard' },
        { label: 'AI Analysis', href: '#ai-analysis' },
        { label: 'Map', href: '#map' },
        { label: 'Charts', href: '#charts' },
        { label: 'Prediction', href: '#prediction' },
        { label: 'History', href: '#history' },
    ];

    return (
        <nav
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                zIndex: 100,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '14px 32px',
                background: scrolled ? 'rgba(240,244,248,0.85)' : 'transparent',
                backdropFilter: scrolled ? 'blur(20px)' : 'none',
                WebkitBackdropFilter: scrolled ? 'blur(20px)' : 'none',
                borderBottom: scrolled ? '1px solid rgba(148,163,184,0.25)' : 'none',
                boxShadow: scrolled ? '0 2px 20px rgba(0,0,0,0.07)' : 'none',
                transition: 'all 0.3s ease',
            }}
        >
            {/* Logo */}
            <span
                style={{
                    fontWeight: 900,
                    fontSize: 18,
                    background: 'linear-gradient(135deg,#0ea5e9,#6366f1)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                }}
            >
                💧 AquaVitals AI
            </span>

            {/* Links */}
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {links.map((l) => (
                    <a
                        key={l.label}
                        href={l.href}
                        style={{
                            fontSize: 13,
                            fontWeight: 600,
                            color: '#475569',
                            textDecoration: 'none',
                            padding: '6px 14px',
                            borderRadius: 99,
                            transition: 'all 0.2s',
                        }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.color = '#0ea5e9';
                            e.currentTarget.style.background = 'rgba(14,165,233,0.08)';
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.color = '#475569';
                            e.currentTarget.style.background = 'transparent';
                        }}
                    >
                        {l.label}
                    </a>
                ))}
            </div>
        </nav>
    );
}

// ── Stat pill ─────────────────────────────────────────────────────────────────

function StatPill({ value, label }: { value: string; label: string }) {
    return (
        <div style={{ textAlign: 'center', padding: '0 24px' }}>
            <div style={{ fontSize: 26, fontWeight: 800, color: '#0ea5e9' }}>{value}</div>
            <div style={{ fontSize: 11, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1, marginTop: 2 }}>
                {label}
            </div>
        </div>
    );
}

// ── Hero ──────────────────────────────────────────────────────────────────────

export default function HeroSection() {
    const scrollTo = (id: string) =>
        document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });

    return (
        <>
            <ParticlesBg />
            <StickyNav />

            <section
                style={{
                    minHeight: '100vh',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    textAlign: 'center',
                    padding: '0 24px',
                    position: 'relative',
                    overflow: 'hidden',
                    // Light gradient background matching original
                    background: 'linear-gradient(160deg, #f0f9ff 0%, #f0f4f8 40%, #f5f3ff 100%)',
                }}
            >
                {/* Blob decorations */}
                <div
                    style={{
                        position: 'absolute', top: '10%', left: '5%',
                        width: 500, height: 500, borderRadius: '50%',
                        background: 'radial-gradient(circle, rgba(14,165,233,0.18) 0%, transparent 70%)',
                        filter: 'blur(40px)', pointerEvents: 'none',
                        animation: 'blobFloat 8s ease-in-out infinite',
                    }}
                />
                <div
                    style={{
                        position: 'absolute', bottom: '15%', right: '5%',
                        width: 400, height: 400, borderRadius: '50%',
                        background: 'radial-gradient(circle, rgba(99,102,241,0.15) 0%, transparent 70%)',
                        filter: 'blur(40px)', pointerEvents: 'none',
                        animation: 'blobFloat 11s ease-in-out infinite reverse',
                    }}
                />

                {/* Content */}
                <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0 }}>

                    {/* Live badge */}
                    <div
                        style={{
                            display: 'inline-flex', alignItems: 'center', gap: 8,
                            background: 'rgba(14,165,233,0.10)',
                            border: '1px solid rgba(14,165,233,0.3)',
                            padding: '8px 20px', borderRadius: 99,
                            marginBottom: 32,
                            fontSize: 13, fontWeight: 600, color: '#0ea5e9',
                            animation: 'fadeInUp 0.8s ease both',
                        }}
                    >
                        <span
                            style={{
                                width: 8, height: 8, borderRadius: '50%',
                                background: '#10b981',
                                boxShadow: '0 0 12px #10b981',
                                display: 'inline-block',
                                animation: 'pulse 2s infinite',
                            }}
                        />
                        Live Monitoring Active
                    </div>

                    {/* Headline */}
                    <h1
                        style={{
                            fontSize: 'clamp(42px, 7vw, 88px)',
                            fontWeight: 900,
                            background: 'linear-gradient(135deg, #1e3a5f 0%, #0ea5e9 40%, #06b6d4 60%, #6366f1 100%)',
                            WebkitBackgroundClip: 'text',
                            WebkitTextFillColor: 'transparent',
                            margin: '0 0 20px',
                            lineHeight: 1.05,
                            letterSpacing: -2,
                            animation: 'fadeInUp 0.9s ease both 0.1s',
                        }}
                    >
                        AquaVitals AI
                    </h1>

                    {/* Subtitle */}
                    <p
                        style={{
                            fontSize: 'clamp(16px, 2.5vw, 22px)',
                            fontWeight: 600,
                            color: '#475569',
                            marginBottom: 14,
                            animation: 'fadeInUp 1s ease both 0.2s',
                        }}
                    >
                        GenAI-Powered Water Intelligence Platform
                    </p>

                    <p
                        style={{
                            fontSize: 'clamp(13px, 1.8vw, 16px)',
                            color: '#94a3b8',
                            marginBottom: 48,
                            maxWidth: 520,
                            margin: '0 auto 48px',
                            animation: 'fadeInUp 1s ease both 0.3s',
                        }}
                    >
                        Transforming sensor readings into actionable health recommendations — in real time,
                        powered by Google Gemini and Firebase.
                    </p>

                    {/* CTA Buttons */}
                    <div
                        style={{
                            display: 'flex', gap: 16, flexWrap: 'wrap',
                            justifyContent: 'center',
                            animation: 'fadeInUp 1s ease both 0.4s',
                        }}
                    >
                        <button
                            onClick={() => scrollTo('dashboard')}
                            style={{
                                padding: '14px 36px', borderRadius: 14,
                                border: 'none', cursor: 'pointer',
                                background: 'linear-gradient(135deg, #0ea5e9, #6366f1)',
                                color: '#fff', fontSize: 15, fontWeight: 700,
                                boxShadow: '0 8px 32px rgba(14,165,233,0.35)',
                                transition: 'all 0.25s ease',
                            }}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.transform = 'scale(1.05) translateY(-2px)';
                                e.currentTarget.style.boxShadow = '0 16px 48px rgba(14,165,233,0.45)';
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.transform = 'scale(1) translateY(0)';
                                e.currentTarget.style.boxShadow = '0 8px 32px rgba(14,165,233,0.35)';
                            }}
                        >
                            🔭 Explore Dashboard
                        </button>

                        <button
                            onClick={() => scrollTo('ai-analysis')}
                            style={{
                                padding: '14px 36px', borderRadius: 14,
                                cursor: 'pointer',
                                background: 'rgba(255,255,255,0.7)',
                                backdropFilter: 'blur(12px)',
                                WebkitBackdropFilter: 'blur(12px)',
                                border: '1.5px solid rgba(14,165,233,0.4)',
                                color: '#0ea5e9', fontSize: 15, fontWeight: 700,
                                boxShadow: '0 4px 20px rgba(0,0,0,0.07)',
                                transition: 'all 0.25s ease',
                            }}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.background = 'rgba(255,255,255,0.9)';
                                e.currentTarget.style.transform = 'scale(1.05)';
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.background = 'rgba(255,255,255,0.7)';
                                e.currentTarget.style.transform = 'scale(1)';
                            }}
                        >
                            🤖 AI Analysis
                        </button>
                    </div>

                    {/* Live stats strip */}
                    <div
                        style={{
                            display: 'flex', flexWrap: 'wrap', justifyContent: 'center',
                            marginTop: 64,
                            borderTop: '1px solid rgba(148,163,184,0.2)',
                            paddingTop: 32,
                            animation: 'fadeInUp 1s ease both 0.5s',
                        }}
                    >
                        <StatPill value="82" label="WQI Score" />
                        <StatPill value="7.2" label="pH Level" />
                        <StatPill value="312 ppm" label="TDS" />
                        <StatPill value="24.6°C" label="Temp" />
                    </div>
                </div>

                <WaveBottom />
            </section>

            {/* Keyframes */}
            <style>{`
        @keyframes blobFloat {
          0%, 100% { transform: translateY(0) scale(1); }
          50%       { transform: translateY(-30px) scale(1.06); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1;   transform: scale(1);   }
          50%       { opacity: 0.6; transform: scale(1.3); }
        }
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(24px); }
          to   { opacity: 1; transform: translateY(0);    }
        }
      `}</style>
        </>
    );
}
