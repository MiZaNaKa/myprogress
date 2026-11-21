import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { translate } from "@/lib/translations";

export type Language = "en" | "my" | "th" | "ja" | "zh" | "hi" | "de" | "fr";

type LanguageContextValue = {
  language: Language;
  languageError: string | null;
  setLanguage: (language: Language) => Promise<boolean>;
  t: (text: string) => string;
};

const LANGUAGE_STORAGE_KEY = "myprogress.language";
const languages: ReadonlySet<string> = new Set([
  "en",
  "my",
  "th",
  "ja",
  "zh",
  "hi",
  "de",
  "fr",
]);

function isLanguage(value: string | null): value is Language {
  return value !== null && languages.has(value);
}
const LanguageContext = createContext<LanguageContextValue | undefined>(
  undefined,
);

export function getLanguageLocale(language: Language) {
  const locales: Record<Language, string> = {
    en: "en-US",
    my: "my-MM",
    th: "th-TH",
    ja: "ja-JP",
    zh: "zh-CN",
    hi: "hi-IN",
    de: "de-DE",
    fr: "fr-FR",
  };
  return locales[language];
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setCurrentLanguage] = useState<Language>("en");
  const [languageError, setLanguageError] = useState<string | null>(null);
  const hasUserSelectedLanguage = useRef(false);

  useEffect(() => {
    let active = true;

    const loadLanguage = async () => {
      try {
        const savedLanguage = await AsyncStorage.getItem(LANGUAGE_STORAGE_KEY);
        if (
          active &&
          !hasUserSelectedLanguage.current &&
          isLanguage(savedLanguage)
        ) {
          setCurrentLanguage(savedLanguage);
        }
      } catch {
        if (active) {
          setLanguageError("Could not load your language preference.");
        }
      }
    };

    void loadLanguage();
    return () => {
      active = false;
    };
  }, []);

  const setLanguage = useCallback(async (nextLanguage: Language) => {
    hasUserSelectedLanguage.current = true;
    try {
      await AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, nextLanguage);
      setCurrentLanguage(nextLanguage);
      setLanguageError(null);
      return true;
    } catch {
      setLanguageError("Could not save your language preference.");
      return false;
    }
  }, []);

  const t = useCallback(
    (text: string) => translate(language, text),
    [language],
  );
  const value = useMemo(
    () => ({ language, languageError, setLanguage, t }),
    [language, languageError, setLanguage, t],
  );

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);

  if (!context) {
    throw new Error("useLanguage must be used inside a LanguageProvider");
  }

  return context;
}
