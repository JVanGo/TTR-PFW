import type { AgeCategory } from "@/lib/age-categories";
import { getRankingRows } from "@/lib/ranking";
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
 * counters behind their K. The counters are read fresh on every call, not
 * through `unstable_cache`: they're written by the weekly simulation run
 * outside any Server Action, and a cached copy (2026-10-27) kept serving the
 * pre-run nulls long after its 5-minute revalidate window — the same
 * non-self-healing cache seen with the ranking in September.
 */
export async function getCalculatorPlayers(): Promise<CalculatorPlayer[]> {
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
}
