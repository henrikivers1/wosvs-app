"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  browserLocale,
  isAppLocale,
  localeDirection,
  type AppLocale,
} from "@/i18n/config";
import { translations, type TranslationKey } from "@/i18n/translations";

const LANGUAGE_STORAGE_KEY = "wosoverwatch-language";

type LanguageContextValue = {
  locale: AppLocale;
  setLocale: (locale: AppLocale) => void;
  t: (key: TranslationKey, values?: Record<string, string | number>) => string;
  formatDateTime: (value: Date | string | number) => string;
  formatNumber: (value: number) => string;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<AppLocale>("en");

  const setLocale = useCallback((nextLocale: AppLocale) => {
    setLocaleState(nextLocale);
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, nextLocale);
  }, []);

  useEffect(() => {
    const loadId = window.setTimeout(() => {
      const storedLocale = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
      setLocaleState(
        isAppLocale(storedLocale) ? storedLocale : browserLocale(),
      );
    }, 0);

    return () => window.clearTimeout(loadId);
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = localeDirection(locale);
  }, [locale]);

  const value = useMemo<LanguageContextValue>(
    () => ({
      locale,
      setLocale,
      t: (key, values) => {
        const template =
          translations[locale][key] ?? translations.en[key] ?? key;

        if (!values) return template;

        return Object.entries(values).reduce(
          (result, [name, replacement]) =>
            result.replaceAll(`{${name}}`, String(replacement)),
          template,
        );
      },
      // Whiteout Survival runs on UTC, so every time in the app is shown
      // in UTC regardless of the viewer's timezone.
      formatDateTime: (date) =>
        `${new Intl.DateTimeFormat(locale, {
          dateStyle: "medium",
          timeStyle: "short",
          hourCycle: "h23",
          timeZone: "UTC",
        }).format(new Date(date))} UTC`,
      formatNumber: (number) => new Intl.NumberFormat(locale).format(number),
    }),
    [locale, setLocale],
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
    throw new Error("useLanguage must be used inside LanguageProvider.");
  }
  return context;
}
