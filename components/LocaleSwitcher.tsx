"use client";

import { useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";

const LOCALES = ["de", "en"] as const;

export function LocaleSwitcher() {
  const locale = useLocale();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const t = useTranslations("LocaleSwitcher");

  const query = searchParams.toString();
  const href = query ? `${pathname}?${query}` : pathname;

  return (
    <div className="flex items-center gap-1 text-sm" aria-label={t("label")}>
      {LOCALES.map((l) => (
        <Link
          key={l}
          href={href}
          locale={l}
          aria-label={t(l)}
          aria-current={l === locale ? "true" : undefined}
          className={l === locale ? "font-semibold" : "text-muted-foreground hover:underline"}
        >
          {l.toUpperCase()}
        </Link>
      ))}
    </div>
  );
}
