import type { SupabaseClient } from "@supabase/supabase-js";
import { unstable_cache } from "next/cache";
import { fetchAllRows } from "@/lib/supabase/fetchAll";
import { fetchLatestTtrByPlayer } from "@/lib/supabase/latestTtr";
import { createPublicClient } from "@/lib/supabase/public";
import { estimateTtr, isPlayerClass, type PlayerClass } from "@/lib/conversions";
import { klassierungForDtr, type Klassierung } from "@/lib/klassierung";
import { AGE_CATEGORIES, type AgeCategory } from "@/lib/import/age-categories";
import { ersteinstufungFor } from "@/lib/import/ttr-simulation";

function isAgeCategory(value: string | null): value is AgeCategory {
  return value != null && (AGE_CATEGORIES as readonly string[]).includes(value);
}

/** Tag used to invalidate the cached ranking after an admin edit or import. */
export const RANKING_CACHE_TAG = "ranking";

export const CURRENT_SEASON = "2025-2026";

export interface RankingRow {
  id: string;
  rank: number;
  name: string;
  club: string | null;
  isActive: boolean;
  dtr: number;
  klassierung: Klassierung;
  /** Non-null age_category (youth per the PDF's Ersteinstufung categories) — used by the Lineup Builder. */
  isYouth: boolean;
  isKader: boolean;
}

interface PlayerRow {
  id: string;
  name: string;
  class: string;
  pfw: number;
  club: string | null;
  is_active: boolean;
  classement_points: number | null;
  age_category: string | null;
  is_kader: boolean;
}

/**
 * The one place a player's current DTR is computed: their latest simulated
 * rating this season, or — if they haven't played yet this season — the
 * season-starting rating that seeds the simulation for everyone. Both
 * `/ranking` and the player profile page read from here so the numbers
 * shown always agree.
 */
async function computeRankingRows(supabase: SupabaseClient): Promise<RankingRow[]> {
  const [players, latestTtrByPlayer] = await Promise.all([
    fetchAllRows<PlayerRow>(
      supabase,
      "players",
      "id, name, class, pfw, club, is_active, classement_points, age_category, is_kader",
    ),
    fetchLatestTtrByPlayer(supabase, CURRENT_SEASON),
  ]);

  const withDtr = players.map((p) => {
    const kl: PlayerClass = isPlayerClass(p.class) ? p.class : "D3";
    const ageCategory = isAgeCategory(p.age_category) ? p.age_category : null;
    const seasonStart = estimateTtr(Number(p.pfw), kl, p.classement_points);

    let dtr: number;
    if (latestTtrByPlayer.has(p.id)) {
      dtr = latestTtrByPlayer.get(p.id)!;
    } else if (seasonStart != null) {
      dtr = seasonStart;
    } else if (kl === "D3") {
      // No classement points on file and never promoted past D3 — a true
      // beginner, with nothing to go on but their age bracket's own
      // starting point.
      dtr = ersteinstufungFor(ageCategory);
    } else {
      // Already placed above D3 by FLTT, just missing a points value in our
      // data — use that class's own zero-point anchor rather than guessing
      // a beginner's rating for someone who plainly isn't one.
      dtr = estimateTtr(Number(p.pfw), kl, 0)!;
    }

    return {
      id: p.id,
      name: p.name,
      club: p.club,
      isActive: p.is_active,
      dtr,
      klassierung: klassierungForDtr(dtr),
      isYouth: ageCategory != null,
      isKader: p.is_kader,
    };
  });

  withDtr.sort((a, b) => {
    if (b.dtr !== a.dtr) return b.dtr - a.dtr;
    return a.name.localeCompare(b.name);
  });

  return withDtr.map((p, i) => ({ ...p, rank: i + 1 }));
}

/**
 * Scanning every player and every match to build the ranking is expensive
 * (~2,200 players, ~80k match rows) and was previously redone from scratch
 * on every visit to the Home, Ranking, and Player pages — the main cause of
 * the site feeling slow. The data barely changes (an admin edit, an import,
 * or an out-of-band season re-simulation), so it's cached for 5 minutes and
 * invalidated immediately on admin writes via `RANKING_CACHE_TAG`.
 */
export const getRankingRows = unstable_cache(
  async (): Promise<RankingRow[]> => computeRankingRows(createPublicClient()),
  ["ranking-rows"],
  { revalidate: 300, tags: [RANKING_CACHE_TAG] },
);
