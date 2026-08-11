import NextLink from "next/link";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";

/**
 * Shown on every public page except About itself (a "how it works" link
 * pointing at the page you're already on is redundant there — About has
 * its own link back to the ranking at the bottom instead).
 */
export async function SiteFooter() {
  const t = await getTranslations("Footer");

  return (
    <footer className="bg-muted/40 mt-12 border-t">
      <div className="text-muted-foreground mx-auto flex w-full max-w-6xl flex-col gap-2 px-4 py-6 text-sm sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p>
          {t("tagline")}{" "}
          <Link href="/about" className="underline">
            {t("howItWorksLink")}
          </Link>
          .
        </p>
        {/* Plain next/link, not the locale-aware one: /login lives outside
            app/[locale]/ and must never get an /en prefix. */}
        <NextLink href="/login" className="hover:underline">
          {t("admin")}
        </NextLink>
      </div>
    </footer>
  );
}
