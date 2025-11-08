import { createContext, useContext, useState, ReactNode } from 'react';
import type { Language } from '../i18n/translations';

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: ReactNode }) {
  // Initialize language from localStorage or default to English
  // Default to English for new users, but respect saved preference
  const [language, setLanguage] = useState<Language>(() => {
    const saved = localStorage.getItem('language');
    // If a valid preference is saved, use it; otherwise default to English
    if (saved === 'en' || saved === 'zh' || saved === 'ko') {
      return saved;
    }
    // No preference saved - default to English
    const defaultLang: Language = 'en';
    localStorage.setItem('language', defaultLang);
    return defaultLang;
  });

  // Save language to localStorage whenever it changes
  const handleSetLanguage = (lang: Language) => {
    setLanguage(lang);
    localStorage.setItem('language', lang);
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage: handleSetLanguage }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within LanguageProvider');
  }
  return context;
}
