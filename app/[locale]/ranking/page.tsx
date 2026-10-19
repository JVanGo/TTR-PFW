import { getTranslations } from "next-intl/server";
import { getRankingRows, CURRENT_SEASON, type RankingRow } from "@/lib/ranking";
import { getCompetitions, type Competition } from "@/lib/competitions";
import { getCompetitionTeamCounts } from "@/lib/competitionTeamCounts";
import { ClubRankingView } from "@/components/ranking/ClubRankingView";
import { RankingBrowser } from "@/components/ranking/RankingBrowser";
import { PAGE_SIZE } from "@/components/ranking/RankingTableRows";
import { SiteFooter } from "@/components/SiteFooter";

interface PageProps {
  searchParams: Promise<{ club?: string; search?: string; page?: string }>;
}

export default async function RankingPage({ searchParams }: PageProps) {
  const t = await getTranslations("RankingPage");
  const sp = await searchParams;
  const initialClub = sp.club ?? "";

  const [all, competitions, teamCountsByCompetition] = await Promise.all([
    getRankingRows(),
    getCompetitions(),
    getCompetitionTeamCounts(CURRENT_SEASON),
  ]);

  return (
    <>
      <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{t("title")}</h1>
          <p className="text-muted-foreground text-sm">{t("subtitle")}</p>
        </div>

        <div className="mt-5 flex flex-col gap-4">
          {initialClub ? (
            <RankingFiltered
              all={all}
              initialClub={initialClub}
              competitions={competitions}
              teamCountsByCompetition={teamCountsByCompetition}
            />
          ) : (
            <RankingBrowserSection all={all} search={sp.search ?? ""} pageParam={sp.page} />
          )}
        </div>
      </div>
      <SiteFooter />
    </>
  );
}

/** A club is already narrowing things down — same behavior as
 * always: the (already smaller) matching set ships in full, with instant
 * client-side search/pagination/club-switching and a working Lineup
 * Builder. */
function RankingFiltered({
  all,
  initialClub,
  competitions,
  teamCountsByCompetition,
}: {
  all: RankingRow[];
  initialClub: string;
  competitions: Competition[];
  teamCountsByCompetition: Record<string, Record<string, number>>;
}) {
  const clubSet = new Set<string>();
  for (const p of all) {
    if (p.club) clubSet.add(p.club);
  }
  const clubs = Array.from(clubSet).sort((a, b) => a.localeCompare(b));

  return (
    <ClubRankingView
      rows={all}
      clubs={clubs}
      initialClub={initialClub}
      competitions={competitions}
      teamCountsByCompetition={teamCountsByCompetition}
    />
  );
}

/** The bare landing state (no club): server-paginated instead of
 * shipping every player, since nothing has narrowed the list down yet. */
function RankingBrowserSection({
  all,
  search,
  pageParam,
}: {
  all: RankingRow[];
  search: string;
  pageParam: string | undefined;
}) {
  const needle = search.trim().toLowerCase();
  const searched = needle ? all.filter((p) => p.name.toLowerCase().includes(needle)) : all;

  const pageCount = Math.max(1, Math.ceil(searched.length / PAGE_SIZE));
  const requestedPage = Number(pageParam);
  const page = Math.min(pageCount, Math.max(1, Number.isFinite(requestedPage) ? requestedPage : 1));
  const rows = searched.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const clubSet = new Set<string>();
  for (const p of all) {
    if (p.club) clubSet.add(p.club);
  }
  const clubs = Array.from(clubSet).sort((a, b) => a.localeCompare(b));

  return (
    <RankingBrowser
      rows={rows}
      totalCount={searched.length}
      page={page}
      pageCount={pageCount}
      clubs={clubs}
      search={search}
    />
  );
}
