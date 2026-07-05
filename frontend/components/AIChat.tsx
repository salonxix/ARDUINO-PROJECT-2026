'use client';

import {
    useState, useRef, useEffect, useCallback,
    KeyboardEvent, forwardRef, useImperativeHandle,
} from 'react';
import { useLanguage, LANG_OPTIONS, AppLanguage } from '@/lib/languageContext';

// ── Types ─────────────────────────────────────────────────────────────────────

type Role = 'user' | 'assistant';

export interface AIChatHandle {
    /** Trigger a message send from outside (used by WaterAnalysisPanel "Explain More") */
    sendExternalMessage: (text: string) => void;
}

interface Message {
    id: string;
    role: Role;
    text: string;
    timestamp: Date;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const generateId = () => Math.random().toString(36).slice(2, 10);
const formatTime = (d: Date) => d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

// Stable date for initial messages — avoids SSR/client hydration mismatch
const STABLE_DATE = new Date(0);

// ── Initial messages ──────────────────────────────────────────────────────────

const INITIAL_MESSAGES: Message[] = [
    {
        id: 'i1', role: 'assistant', timestamp: STABLE_DATE,
        text: "Hello! I'm AquaVitals AI 🌊 I can help you understand your water quality readings, explain sensor values, and give health recommendations. Ask me anything!",
    },
    {
        id: 'i2', role: 'user', timestamp: STABLE_DATE,
        text: 'What does a TDS of 540 ppm mean?',
    },
    {
        id: 'i3', role: 'assistant', timestamp: STABLE_DATE,
        text: "TDS of 540 ppm is above the WHO recommended limit of 300 ppm. Think of it like slightly salty mineral water — it won't cause immediate harm for adults, but long-term consumption may increase mineral buildup and affect kidney health. I'd recommend using an RO filter to bring it below 300 ppm. 💧",
    },
];

// ── Suggestion chips per language ─────────────────────────────────────────────

const SUGGESTIONS: Record<AppLanguage, string[]> = {
    english: [
        'Is my water safe to drink?',
        'What does high turbidity mean?',
        'How do I reduce TDS?',
        'Explain pH levels',
        'What is WQI?',
        'Recommend a water filter',
    ],
    kannada: [
        'ನನ್ನ ನೀರು ಕುಡಿಯಲು ಸುರಕ್ಷಿತವೇ?',
        'TDS ಜಾಸ್ತಿ ಇದ್ದರೆ ಏನು?',
        'pH ಅಂದರೆ ಏನು?',
        'ನೀರು ಶುದ್ಧ ಮಾಡುವ ವಿಧಾನ ಹೇಳಿ',
        'WQI ಅಂದರೆ ಏನು?',
        'ಯಾವ ಫಿಲ್ಟರ್ ಉತ್ತಮ?',
    ],
    hindi: [
        'क्या मेरा पानी पीने लायक है?',
        'TDS ज़्यादा हो तो क्या करें?',
        'pH का मतलब क्या है?',
        'पानी साफ़ करने के तरीके बताएं',
        'WQI क्या होता है?',
        'कौन सा फ़िल्टर बेहतर है?',
    ],
};

const PLACEHOLDER: Record<AppLanguage, string> = {
    english: 'Ask about your water quality… (Enter to send)',
    kannada: 'ನಿಮ್ಮ ಪ್ರಶ್ನೆ ಕೇಳಿ… (Enter ಒತ್ತಿ ಕಳಿಸಿ)',
    hindi: 'पानी की गुणवत्ता के बारे में पूछें… (Enter दबाएं)',
};

// ── Sub-components ────────────────────────────────────────────────────────────

function MessageBubble({ message }: { message: Message }) {
    const isUser = message.role === 'user';
    return (
        <div className={`flex items-end gap-2.5 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm shrink-0 border"
                style={{
                    background: isUser ? 'rgba(14,165,233,0.15)' : 'rgba(99,102,241,0.15)',
                    borderColor: isUser ? 'rgba(14,165,233,0.4)' : 'rgba(99,102,241,0.4)',
                }}>
                {isUser ? '👤' : '🤖'}
            </div>
            <div className={`flex flex-col gap-1 max-w-[75%] ${isUser ? 'items-end' : 'items-start'}`}>
                <div style={{
                    padding: '10px 16px',
                    borderRadius: isUser ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                    fontSize: 14, lineHeight: 1.6, wordBreak: 'break-word', color: '#000000',
                    background: isUser ? 'linear-gradient(135deg,#e0f2fe,#bae6fd)' : '#ffffff',
                    border: isUser ? '1px solid rgba(14,165,233,0.3)' : '1px solid rgba(0,0,0,0.1)',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
                }}>
                    {message.text}
                </div>
                <span style={{ fontSize: 11, color: '#64748b', padding: '0 4px' }}>
                    {message.timestamp.getTime() === 0 ? '' : formatTime(message.timestamp)}
                </span>
            </div>
        </div>
    );
}

function TypingIndicator() {
    return (
        <div className="flex items-end gap-2.5">
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm shrink-0 border"
                style={{ background: 'rgba(99,102,241,0.15)', borderColor: 'rgba(99,102,241,0.4)' }}>
                🤖
            </div>
            <div style={{ padding: '12px 16px', borderRadius: '18px 18px 18px 4px', background: '#ffffff', border: '1px solid rgba(0,0,0,0.1)', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
                <div className="flex items-center gap-1.5 h-4">
                    {[0, 1, 2].map((i) => (
                        <span key={i} className="w-2 h-2 rounded-full animate-bounce"
                            style={{ background: '#0ea5e9', animationDelay: `${i * 0.15}s` }} />
                    ))}
                </div>
            </div>
        </div>
    );
}

// ── Main component ────────────────────────────────────────────────────────────

const AIChat = forwardRef<AIChatHandle>(function AIChat(_props, ref) {
    const { language, setLanguage } = useLanguage();

    const [messages, setMessages] = useState<Message[]>(INITIAL_MESSAGES);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const sectionRef = useRef<HTMLElement>(null);
    const bottomRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);

    // Auto-scroll
    useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, loading]);

    // Auto-resize textarea
    useEffect(() => {
        const ta = inputRef.current;
        if (!ta) return;
        ta.style.height = 'auto';
        ta.style.height = `${Math.min(ta.scrollHeight, 120)}px`;
    }, [input]);

    const sendMessage = useCallback(async (text: string) => {
        const trimmed = text.trim();
        if (!trimmed || loading) return;

        setError(null);
        const userMsg: Message = { id: generateId(), role: 'user', text: trimmed, timestamp: new Date() };
        const updated = [...messages, userMsg];
        setMessages(updated);
        setInput('');
        setLoading(true);

        try {
            const res = await fetch('/api/chat', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    messages: updated.map((m) => ({ role: m.role, text: m.text })),
                    language,
                }),
            });
            const data = await res.json();
            if (!res.ok || data.error) throw new Error(data.error ?? `Server error ${res.status}`);
            setMessages((prev) => [...prev, { id: generateId(), role: 'assistant', text: data.reply, timestamp: new Date() }]);
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Something went wrong.';
            setError(msg);
            setMessages((prev) => [...prev, { id: generateId(), role: 'assistant', text: `⚠️ ${msg}`, timestamp: new Date() }]);
        } finally {
            setLoading(false);
            inputRef.current?.focus();
        }
    }, [loading, messages, language]);

    // Expose sendExternalMessage + scroll to parent via ref
    useImperativeHandle(ref, () => ({
        sendExternalMessage: (text: string) => {
            sectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            setTimeout(() => sendMessage(text), 300);
        },
    }), [sendMessage]);

    const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(input); }
    };

    const clearChat = () => { setMessages(INITIAL_MESSAGES); setInput(''); setError(null); };
    const canSend = input.trim().length > 0 && !loading;

    return (
        <section ref={sectionRef as React.RefObject<HTMLElement>}
            className="max-w-5xl mx-auto mt-12" id="chat"
            style={{
                background: 'linear-gradient(135deg,#f0f9ff 0%,#faf5ff 100%)',
                borderRadius: 24, padding: 32,
                boxShadow: '0 8px 40px rgba(14,165,233,0.15),0 2px 8px rgba(0,0,0,0.06)',
                border: '1.5px solid rgba(14,165,233,0.2)',
            }}>

            {/* Header */}
            <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-full flex items-center justify-center text-xl"
                    style={{ background: 'linear-gradient(135deg,#0ea5e9,#6366f1)', boxShadow: '0 4px 16px rgba(14,165,233,0.4)' }}>
                    💬
                </div>
                <div>
                    <h2 style={{ fontSize: 20, fontWeight: 700, color: '#000000', margin: 0 }}>AquaVitals AI Chat</h2>
                    <p style={{ fontSize: 12, color: '#475569', margin: '2px 0 0' }}>Powered by Gemini · Ask anything about your water quality</p>
                </div>
                <button onClick={clearChat}
                    style={{ marginLeft: 'auto', fontSize: 12, padding: '6px 14px', borderRadius: 8, border: '1px solid rgba(0,0,0,0.12)', background: '#ffffff', color: '#475569', cursor: 'pointer', transition: 'all 0.2s' }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = '#f1f5f9'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = '#ffffff'; }}>
                    🗑 Clear chat
                </button>
            </div>

            {/* Error banner */}
            {error && (
                <div style={{ padding: '10px 16px', borderRadius: 10, marginBottom: 12, background: '#fef2f2', border: '1px solid #fca5a5', color: '#991b1b', fontSize: 13 }}>
                    ⚠️ {error}
                </div>
            )}

            {/* Chat window */}
            <div style={{ borderRadius: 16, overflow: 'hidden', display: 'flex', flexDirection: 'column', height: 480, background: '#f8fafc', border: '1px solid rgba(0,0,0,0.1)', boxShadow: 'inset 0 2px 8px rgba(0,0,0,0.04)' }}>

                {/* Messages */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '20px 20px 12px' }} className="space-y-4">
                    {messages.map((msg) => <MessageBubble key={msg.id} message={msg} />)}
                    {loading && <TypingIndicator />}
                    <div ref={bottomRef} />
                </div>

                {/* Suggestion chips */}
                {messages.length <= INITIAL_MESSAGES.length && !loading && (
                    <div style={{ padding: '8px 20px 10px', borderTop: '1px solid rgba(0,0,0,0.07)', display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                        {SUGGESTIONS[language].map((s) => (
                            <button key={s} onClick={() => sendMessage(s)}
                                style={{ fontSize: 12, padding: '5px 14px', borderRadius: 99, cursor: 'pointer', border: '1.5px solid rgba(14,165,233,0.4)', background: 'rgba(14,165,233,0.06)', color: '#0369a1', fontWeight: 600, transition: 'all 0.2s' }}
                                onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(14,165,233,0.14)'; }}
                                onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(14,165,233,0.06)'; }}>
                                {s}
                            </button>
                        ))}
                    </div>
                )}

                {/* Language selector + Input */}
                <div style={{ borderTop: '1px solid rgba(0,0,0,0.08)', background: '#ffffff' }}>

                    {/* Language pills */}
                    <div style={{ padding: '8px 16px 0', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 11, color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Language</span>
                        <div style={{ display: 'flex', gap: 4 }}>
                            {LANG_OPTIONS.map((opt) => (
                                <button key={opt.value} onClick={() => setLanguage(opt.value as AppLanguage)}
                                    style={{
                                        fontSize: 12, padding: '3px 10px', borderRadius: 99, cursor: 'pointer',
                                        border: language === opt.value ? '1.5px solid #0ea5e9' : '1.5px solid rgba(0,0,0,0.12)',
                                        background: language === opt.value ? 'rgba(14,165,233,0.1)' : 'transparent',
                                        color: language === opt.value ? '#0369a1' : '#64748b',
                                        fontWeight: language === opt.value ? 700 : 400,
                                        transition: 'all 0.15s',
                                    }}>
                                    {opt.flag} {opt.native}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Input row */}
                    <div style={{ padding: '8px 16px 12px', display: 'flex', alignItems: 'flex-end', gap: 10 }}>
                        <textarea ref={inputRef} value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder={PLACEHOLDER[language]}
                            rows={1} suppressHydrationWarning
                            style={{ flex: 1, resize: 'none', outline: 'none', border: '1.5px solid rgba(14,165,233,0.35)', borderRadius: 12, padding: '10px 14px', fontSize: 14, color: '#000000', background: '#f8fafc', lineHeight: 1.5, minHeight: 42, maxHeight: 120, fontFamily: 'inherit', transition: 'border-color 0.2s' }}
                            onFocus={(e) => { e.currentTarget.style.borderColor = '#0ea5e9'; }}
                            onBlur={(e) => { e.currentTarget.style.borderColor = 'rgba(14,165,233,0.35)'; }}
                        />
                        <button onClick={() => sendMessage(input)} disabled={!canSend} aria-label="Send"
                            style={{ width: 44, height: 44, borderRadius: 12, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: canSend ? 'pointer' : 'not-allowed', opacity: canSend ? 1 : 0.4, background: canSend ? 'linear-gradient(135deg,#0891b2,#06b6d4)' : '#e2e8f0', border: 'none', boxShadow: canSend ? '0 4px 12px rgba(6,182,212,0.4)' : 'none', transition: 'all 0.2s' }}>
                            {loading
                                ? <span style={{ width: 18, height: 18, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.8s linear infinite' }} />
                                : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>}
                        </button>
                    </div>
                </div>
            </div>

            {/* Footer hint */}
            <p style={{ fontSize: 11, color: '#94a3b8', textAlign: 'center', marginTop: 10 }}>
                Press <kbd style={{ padding: '1px 6px', borderRadius: 4, border: '1px solid #cbd5e1', background: '#f1f5f9', fontFamily: 'monospace', fontSize: 11, color: '#475569' }}>Enter</kbd> to send &nbsp;·&nbsp;
                <kbd style={{ padding: '1px 6px', borderRadius: 4, border: '1px solid #cbd5e1', background: '#f1f5f9', fontFamily: 'monospace', fontSize: 11, color: '#475569' }}>Shift+Enter</kbd> for a new line
            </p>

            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </section>
    );
});

AIChat.displayName = 'AIChat';
export default AIChat;
