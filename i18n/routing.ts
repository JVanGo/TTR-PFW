import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["de", "en"],
  defaultLocale: "de",
  localePrefix: "as-needed",
  // German always shows first for a new visitor — no Accept-Language based
  // auto-detection (next-intl's default). Confirmed with Jeff: predictable
  // over "smart".
  localeDetection: false,
});
