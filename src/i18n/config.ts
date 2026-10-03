export const SUPPORTED_LOCALES = [
  "en",
  "zh",
  "es",
  "pt",
  "ar",
  "hi",
  "ru",
  "id",
  "th",
] as const;

export type AppLocale = (typeof SUPPORTED_LOCALES)[number];

export const LANGUAGE_OPTIONS: Array<{
  code: AppLocale;
  label: string;
}> = [
  // Only fully translated languages are offered. Portuguese, Hindi, Russian
  // and Indonesian stay supported for saved preferences but only cover the
  // header, so they are not listed.
  { code: "en", label: "English" },
  { code: "zh", label: "简体中文" },
  { code: "es", label: "Español" },
  { code: "ar", label: "العربية" },
  { code: "th", label: "ไทย" },
];

export function isAppLocale(value: unknown): value is AppLocale {
  return (
    typeof value === "string" && SUPPORTED_LOCALES.includes(value as AppLocale)
  );
}

export function localeDirection(locale: AppLocale): "ltr" | "rtl" {
  return locale === "ar" ? "rtl" : "ltr";
}

export function browserLocale(): AppLocale {
  if (typeof navigator === "undefined") return "en";
  const preferredLanguages = navigator.languages.length
    ? navigator.languages
    : [navigator.language];

  for (const language of preferredLanguages) {
    const baseLanguage = language.toLowerCase().split("-")[0];
    if (isAppLocale(baseLanguage)) return baseLanguage;
  }

  return "en";
}
