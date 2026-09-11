import { getTranslations } from "next-intl/server";
import { getRankingRows, type RankingRow } from "@/lib/ranking";
import { getCompetitions, type Competition } from "@/lib/competitions";
import { KLASSIERUNG_BANDS, type Klassierung } from "@/lib/klassierung";
import { LevelPills } from "@/components/ranking/LevelPills";
import { ClubRankingView } from "@/components/ranking/ClubRankingView";
import { RankingBrowser } from "@/components/ranking/RankingBrowser";
import { PAGE_SIZE } from "@/components/ranking/RankingTableRows";
import { SiteFooter } from "@/components/SiteFooter";

interface PageProps {
  searchParams: Promise<{ level?: string; club?: string; search?: string; page?: string }>;
}

function isKlassierung(value: unknown): value is Klassierung {
  return typeof value === "string" && (KLASSIERUNG_BANDS as readonly string[]).includes(value);
}

export default async function RankingPage({ searchParams }: PageProps) {
  const t = await getTranslations("RankingPage");
  const sp = await searchParams;
  const selectedLevel = sp.level && isKlassierung(sp.level) ? sp.level : null;
  const initialClub = sp.club ?? "";

  const [all, competitions] = await Promise.all([getRankingRows(), getCompetitions()]);

  const counts: Record<string, number> = {};
  for (const p of all) {
    counts[p.klassierung] = (counts[p.klassierung] ?? 0) + 1;
  }

  return (
    <>
      <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{t("title")}</h1>
          <p className="text-muted-foreground text-sm">{t("subtitle")}</p>
        </div>

        <div className="mt-5 flex flex-col gap-4">
          <LevelPills
            selected={selectedLevel ?? "All"}
            counts={counts}
            total={all.length}
            club={initialClub || null}
          />
          {selectedLevel || initialClub ? (
            <RankingFiltered
              all={all}
              selectedLevel={selectedLevel}
              initialClub={initialClub}
              competitions={competitions}
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

/** A level or club is already narrowing things down — same behavior as
 * always: the (already smaller) matching set ships in full, with instant
 * client-side search/pagination/club-switching and a working Lineup
 * Builder. */
function RankingFiltered({
  all,
  selectedLevel,
  initialClub,
  competitions,
}: {
  all: RankingRow[];
  selectedLevel: Klassierung | null;
  initialClub: string;
  competitions: Competition[];
}) {
  const filtered = selectedLevel ? all.filter((p) => p.klassierung === selectedLevel) : all;

  const clubSet = new Set<string>();
  for (const p of filtered) {
    if (p.club) clubSet.add(p.club);
  }
  const clubs = Array.from(clubSet).sort((a, b) => a.localeCompare(b));

  return (
    <ClubRankingView
      rows={filtered}
      clubs={clubs}
      selectedLevel={selectedLevel ?? "All"}
      initialClub={initialClub}
      competitions={competitions}
    />
  );
}

/** The bare landing state (no level, no club): server-paginated instead of
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
