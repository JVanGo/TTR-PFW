import { getFormatter, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { RankingTableRows, type RankingTableRow } from "@/components/ranking/RankingTableRows";
import { RankingBrowserControls } from "@/components/ranking/RankingBrowserControls";

interface Props {
  rows: RankingTableRow[];
  totalCount: number;
  page: number;
  pageCount: number;
  clubs: string[];
  search: string;
}

/**
 * The bare "All players, no level, no club" landing view — unlike
 * ClubRankingView/RankingTable, this never receives the full ~3,823-row
 * list. `page.tsx` sends just the current page (search-filtered) plus the
 * club names, and pagination/search here trigger a fresh server render
 * (via RankingBrowserControls / plain Links) instead of local filtering.
 */
export async function RankingBrowser({ rows, totalCount, page, pageCount, clubs, search }: Props) {
  const t = await getTranslations("RankingTable");
  const format = await getFormatter();

  const pageHref = (p: number) =>
    `/ranking?${search ? `search=${encodeURIComponent(search)}&` : ""}page=${p}`;

  return (
    <div className="flex flex-col gap-4">
      <RankingBrowserControls
        clubs={clubs}
        initialSearch={search}
        searchPlaceholder={t("searchPlaceholder")}
        searchAriaLabel={t("searchAriaLabel")}
        clubFilterAriaLabel={t("clubFilterAriaLabel")}
        allClubsLabel={t("allClubs")}
      />

      <p className="text-muted-foreground text-sm">{t("showing", { count: totalCount })}.</p>

      <RankingTableRows
        rows={rows}
        formatNumber={(n) => format.number(n)}
        labels={{
          columnRank: t("columnRank"),
          columnName: t("columnName"),
          columnClub: t("columnClub"),
          columnClass: t("columnClass"),
          columnDtr: t("columnDtr"),
          inactiveBadge: t("inactiveBadge"),
          noResults: t("noResults"),
        }}
      />

      {pageCount > 1 && (
        <div className="flex items-center justify-between text-sm">
          <Link
            href={pageHref(Math.max(1, page - 1))}
            aria-disabled={page <= 1}
            className={
              "border-input rounded-md border px-3 py-1.5" +
              (page <= 1 ? " pointer-events-none opacity-40" : "")
            }
          >
            {t("previous")}
          </Link>
          <span className="text-muted-foreground">
            {t("pageOf", { current: page, total: pageCount })}
          </span>
          <Link
            href={pageHref(Math.min(pageCount, page + 1))}
            aria-disabled={page >= pageCount}
            className={
              "border-input rounded-md border px-3 py-1.5" +
              (page >= pageCount ? " pointer-events-none opacity-40" : "")
            }
          >
            {t("next")}
          </Link>
        </div>
      )}
    </div>
  );
}
