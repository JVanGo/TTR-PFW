import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getRankingRows } from "@/lib/ranking";
import { bucketizeDtr } from "@/lib/dtr-distribution";
import { DtrDistributionChart } from "@/components/about/DtrDistributionChart";
import { TOLERANCE } from "@/lib/lineup";

// See app/[locale]/page.tsx for why: without a cookie-bound client, Next
// would try to statically prerender this page at build time by hitting the
// live database directly — getRankingRows() is already cached, so a
// per-request render is cheap after the first hit.
export const dynamic = "force-dynamic";

export default async function AboutPage() {
  const t = await getTranslations("AboutPage");
  const rows = await getRankingRows();
  const buckets = bucketizeDtr(rows.map((r) => r.dtr));

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{t("title")}</h1>

      <p className="text-muted-foreground mt-4 text-sm leading-6">{t("intro")}</p>

      <h2 className="mt-8 text-lg font-semibold">{t("dataSourceHeading")}</h2>
      <p className="text-muted-foreground mt-2 text-sm leading-6">
        {t.rich("dataSourceBody", { code: (chunks) => <code>{chunks}</code> })}
      </p>

      <h2 className="mt-8 text-lg font-semibold">{t("startingValuesHeading")}</h2>
      <p className="text-muted-foreground mt-2 text-sm leading-6">{t("startingValuesBody")}</p>
      <p className="text-muted-foreground mt-2 text-sm leading-6">
        {t("startingValuesHistoricalNote")}
      </p>

      <h2 className="mt-8 text-lg font-semibold">{t("kFactorHeading")}</h2>
      <p className="text-muted-foreground mt-2 text-sm leading-6">{t("kFactorBody")}</p>

      <h2 className="mt-8 text-lg font-semibold">{t("inactivityHeading")}</h2>
      <p className="text-muted-foreground mt-2 text-sm leading-6">{t("inactivityBody")}</p>

      <h2 className="mt-8 text-lg font-semibold">{t("distributionHeading")}</h2>
      <p className="text-muted-foreground mt-2 text-sm leading-6">
        {t("distributionSubtitle", { count: rows.length })}
      </p>
      <div className="mt-4 rounded-md border p-2">
        <DtrDistributionChart buckets={buckets} />
      </div>

      <h2 className="mt-8 text-lg font-semibold">{t("lineupRulesHeading")}</h2>
      <p className="text-muted-foreground mt-2 text-sm leading-6">
        {t("lineupRulesIntro1")}{" "}
        <Link href="/ranking" className="underline">
          {t("lineupRulesRankingLink")}
        </Link>{" "}
        {t("lineupRulesIntro2")}
      </p>
      <div className="mt-4 overflow-x-auto rounded-md border">
        <table className="w-full min-w-[480px] text-sm">
          <thead className="bg-muted/80 text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left font-medium">{t("tableGapHeader")}</th>
              <th className="px-3 py-2 text-right font-medium">{t("tableTeamHeader")}</th>
              <th className="px-3 py-2 text-right font-medium">{t("tableClubHeader")}</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-t">
              <td className="px-3 py-2">{t("tableEveryone")}</td>
              <td className="px-3 py-2 text-right tabular-nums">{TOLERANCE.base.team}</td>
              <td className="px-3 py-2 text-right tabular-nums">{TOLERANCE.base.club}</td>
            </tr>
            <tr className="border-t">
              <td className="px-3 py-2">{t("tableYouth")}</td>
              <td className="px-3 py-2 text-right tabular-nums">{TOLERANCE.youth.team}</td>
              <td className="px-3 py-2 text-right tabular-nums">{TOLERANCE.youth.club}</td>
            </tr>
            <tr className="border-t">
              <td className="px-3 py-2">{t("tableKader")}</td>
              <td className="px-3 py-2 text-right tabular-nums">{TOLERANCE.kader.team}</td>
              <td className="px-3 py-2 text-right tabular-nums">{TOLERANCE.kader.club}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="text-muted-foreground mt-2 text-sm leading-6">{t("lineupRulesFootnote")}</p>

      <h2 className="mt-8 text-lg font-semibold">{t("furtherReadingHeading")}</h2>
      <ul className="text-muted-foreground mt-2 list-disc pl-6 text-sm leading-6">
        <li>
          <a
            href="/ir-22-performance-system-v42.pdf"
            target="_blank"
            rel="noreferrer"
            className="underline"
          >
            {t("furtherReadingFlttTitle")}
          </a>
          {t("furtherReadingFlttBody")}
        </li>
        <li>
          <a
            href="/beschreibung-der-andro-rangliste.pdf"
            target="_blank"
            rel="noreferrer"
            className="underline"
          >
            {t("furtherReadingDttbTitle")}
          </a>
          {t("furtherReadingDttbBody")}
        </li>
      </ul>

      <p className="mt-8 text-sm">
        <Link href="/ranking" className="underline">
          {t("backToRanking")}
        </Link>
      </p>
    </div>
  );
}
