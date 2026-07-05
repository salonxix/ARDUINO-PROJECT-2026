'use client';

import { createContext, useContext, useState, ReactNode } from 'react';

export type AppLanguage = 'english' | 'kannada' | 'hindi';

export interface LangOption {
    value: AppLanguage;
    label: string;
    native: string;    // label in the language itself
    flag: string;
    bcp47: string;    // BCP-47 code for SpeechSynthesis
}

export const LANG_OPTIONS: LangOption[] = [
    { value: 'english', label: 'English', native: 'English', flag: '🇬🇧', bcp47: 'en-US' },
    { value: 'kannada', label: 'Kannada', native: 'ಕನ್ನಡ', flag: '🇮🇳', bcp47: 'kn-IN' },
    { value: 'hindi', label: 'Hindi', native: 'हिन्दी', flag: '🇮🇳', bcp47: 'hi-IN' },
];

interface LanguageContextValue {
    language: AppLanguage;
    setLanguage: (l: AppLanguage) => void;
    langOption: LangOption;
}

const LanguageContext = createContext<LanguageContextValue>({
    language: 'english',
    setLanguage: () => { },
    langOption: LANG_OPTIONS[0],
});

export function LanguageProvider({ children }: { children: ReactNode }) {
    const [language, setLanguage] = useState<AppLanguage>('english');
    const langOption = LANG_OPTIONS.find((l) => l.value === language) ?? LANG_OPTIONS[0];

    return (
        <LanguageContext.Provider value={{ language, setLanguage, langOption }}>
            {children}
        </LanguageContext.Provider>
    );
}

export function useLanguage() {
    return useContext(LanguageContext);
}
