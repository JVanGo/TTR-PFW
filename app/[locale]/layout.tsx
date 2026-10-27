import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { hasLocale } from "next-intl";
import { notFound } from "next/navigation";
import { routing } from "@/i18n/routing";
import { Link } from "@/i18n/navigation";
import { LocaleSwitcher } from "@/components/LocaleSwitcher";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Metadata" });
  return { title: t("title"), description: t("description") };
}

// Deliberately no generateStaticParams here: two pages under this layout
// (Home, About) already need force-dynamic to avoid a build-time database
// fetch (see their own files) — pre-generating locale params would only
// resurrect that problem, doubled across both locales, for no benefit.
export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  const t = await getTranslations("Nav");

  return (
    <NextIntlClientProvider>
      <header className="border-b">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-4 sm:px-6">
          <Link href="/" className="text-base font-semibold tracking-tight sm:text-lg">
            {t("brand")}
          </Link>
          <nav className="flex items-center gap-3 text-sm font-medium sm:gap-4">
            <Link href="/ranking" className="hover:underline">
              {t("rankings")}
            </Link>
            <Link href="/rechner" className="hover:underline">
              {t("calculator")}
            </Link>
            <Link href="/about" className="hover:underline">
              {t("about")}
            </Link>
            <LocaleSwitcher />
          </nav>
        </div>
      </header>
      <main className="flex-1">{children}</main>
    </NextIntlClientProvider>
  );
}
