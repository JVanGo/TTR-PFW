import { unstable_cache } from "next/cache";
import type { AgeCategory } from "@/lib/age-categories";
import { getRankingRows, RANKING_CACHE_TAG } from "@/lib/ranking";
import { fetchAllRows } from "@/lib/supabase/fetchAll";
import { createPublicClient } from "@/lib/supabase/public";

/** One pickable player in the DTR-Rechner — everything their next game's K and change need. */
export interface CalculatorPlayer {
  id: string;
  name: string;
  club: string | null;
  dtr: number;
  ageCategory: AgeCategory | null;
  /** Null until the season simulation has filled it in (see players.career_matches). */
  careerMatches: number | null;
  returningGamesLeft: number | null;
}

interface KStateRow {
  id: string;
  career_matches: number | null;
  returning_bonus_games_left: number | null;
}

/**
 * Every ranked (active) player, with the same DTR `/ranking` shows plus the
 * counters behind their K. Cached and invalidated alongside the ranking.
 */
export const getCalculatorPlayers = unstable_cache(
  async (): Promise<CalculatorPlayer[]> => {
    const [rows, kStates] = await Promise.all([
      getRankingRows(),
      fetchAllRows<KStateRow>(
        createPublicClient(),
        "players",
        "id, career_matches, returning_bonus_games_left",
      ),
    ]);
    const kStateById = new Map(kStates.map((s) => [s.id, s]));
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      club: r.club,
      dtr: r.dtr,
      ageCategory: r.ageCategory,
      careerMatches: kStateById.get(r.id)?.career_matches ?? null,
      returningGamesLeft: kStateById.get(r.id)?.returning_bonus_games_left ?? null,
    }));
  },
  ["calculator-players-v1"],
  { revalidate: 300, tags: [RANKING_CACHE_TAG] },
);
