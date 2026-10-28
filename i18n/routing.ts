import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["de", "en", "fr"],
  defaultLocale: "de",
  localePrefix: "as-needed",
  // German always shows first for a new visitor — no Accept-Language based
  // auto-detection (next-intl's default). Confirmed with Jeff: predictable
  // over "smart".
  localeDetection: false,
});

const DATE_LOCALES: Record<string, string> = { de: "de-DE", en: "en-GB", fr: "fr-FR" };

/** The full locale to format dates with for a site language. */
export function dateLocale(locale: string): string {
  return DATE_LOCALES[locale] ?? "en-GB";
}
