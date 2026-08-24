import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { CURRENT_SEASON, getRankingRows } from "@/lib/ranking";
import { PlayerSearch } from "@/components/home/PlayerSearch";
import { SiteFooter } from "@/components/SiteFooter";

// Render per-request rather than prerendering at build time: without a
// cookie-bound client on this page, Next would otherwise try to statically
// generate it during `next build` by hitting the live database directly
// (no cache warmed yet), which is slow and unnecessary — getRankingRows()
// is already cached, so a per-request render is cheap after the first hit.
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const t = await getTranslations("HomePage");
  const rows = await getRankingRows();

  const clubCounts = new Map<string, number>();
  for (const p of rows) {
    if (!p.club) continue;
    clubCounts.set(p.club, (clubCounts.get(p.club) ?? 0) + 1);
  }
  const clubs = Array.from(clubCounts.entries()).sort((a, b) => a[0].localeCompare(b[0]));

  return (
    <>
      <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{t("title")}</h1>
        <p className="text-muted-foreground mt-3 text-base leading-7">
          {t("intro1", { season: CURRENT_SEASON })}
        </p>
        <p className="text-muted-foreground mt-4 text-base leading-7">
          {t("intro2")}{" "}
          <Link href="/about" className="underline">
            {t("readMore")}
          </Link>
        </p>

        <div className="mt-8">
          <PlayerSearch />
        </div>

        <div className="mt-4">
          <Link
            href="/ranking"
            className="text-sm font-medium underline underline-offset-4 hover:no-underline"
          >
            {t("browseRanking")}
          </Link>
        </div>

        <section className="mt-12">
          <h2 className="text-lg font-semibold">{t("clubsHeading")}</h2>
          <p className="text-muted-foreground mt-1 text-sm">
            {t("clubsSubtitle", { count: clubs.length })}
          </p>
          <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {clubs.map(([club, count]) => (
              <Link
                key={club}
                href={`/ranking?club=${encodeURIComponent(club)}`}
                className="hover:bg-accent hover:text-accent-foreground flex items-center justify-between rounded-md border px-3 py-2 text-sm"
              >
                <span>{club}</span>
                <span className="text-muted-foreground tabular-nums">{count}</span>
              </Link>
            ))}
          </div>
        </section>
      </div>
      <SiteFooter />
    </>
  );
}
