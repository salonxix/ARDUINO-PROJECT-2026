'use client';

import { useLanguage, LANG_OPTIONS, AppLanguage } from '@/lib/languageContext';

export default function LanguageSelector() {
    const { language, setLanguage } = useLanguage();

    return (
        <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 font-semibold uppercase tracking-wider hidden sm:inline">
                Language
            </span>
            <div className="flex gap-1">
                {LANG_OPTIONS.map((opt) => {
                    const active = language === opt.value;
                    return (
                        <button
                            key={opt.value}
                            onClick={() => setLanguage(opt.value as AppLanguage)}
                            title={opt.label}
                            className={`flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-full border transition-all duration-150 cursor-pointer
                                ${active
                                    ? 'border-cyan-500/60 bg-cyan-500/15 text-cyan-300'
                                    : 'border-white/15 bg-white/5 text-gray-400 hover:border-cyan-500/30 hover:text-gray-200'
                                }`}
                        >
                            <span>{opt.flag}</span>
                            <span className="hidden sm:inline">{opt.native}</span>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
