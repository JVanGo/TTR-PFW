import { getTranslations } from "next-intl/server";
import { getRankingRows } from "@/lib/ranking";
import { KLASSIERUNG_BANDS, type Klassierung } from "@/lib/klassierung";
import { LevelPills } from "@/components/ranking/LevelPills";
import { ClubRankingView } from "@/components/ranking/ClubRankingView";
import { SiteFooter } from "@/components/SiteFooter";

interface PageProps {
  searchParams: Promise<{ level?: string; club?: string }>;
}

function isKlassierung(value: unknown): value is Klassierung {
  return typeof value === "string" && (KLASSIERUNG_BANDS as readonly string[]).includes(value);
}

export default async function RankingPage({ searchParams }: PageProps) {
  const t = await getTranslations("RankingPage");
  const sp = await searchParams;
  const selectedLevel = sp.level && isKlassierung(sp.level) ? sp.level : null;
  const initialClub = sp.club ?? "";

  const all = await getRankingRows();

  const counts: Record<string, number> = {};
  for (const p of all) {
    counts[p.klassierung] = (counts[p.klassierung] ?? 0) + 1;
  }

  const filtered = selectedLevel ? all.filter((p) => p.klassierung === selectedLevel) : all;

  const clubSet = new Set<string>();
  for (const p of filtered) {
    if (p.club) clubSet.add(p.club);
  }
  const clubs = Array.from(clubSet).sort((a, b) => a.localeCompare(b));

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
          <ClubRankingView
            rows={filtered}
            clubs={clubs}
            selectedLevel={selectedLevel ?? "All"}
            initialClub={initialClub}
          />
        </div>
      </div>
      <SiteFooter />
    </>
  );
}
