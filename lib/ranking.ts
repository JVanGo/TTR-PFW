import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllRows } from "@/lib/supabase/fetchAll";
import { estimateTtr, isPlayerClass, type PlayerClass } from "@/lib/conversions";
import { klassierungForDtr, type Klassierung } from "@/lib/klassierung";

export const CURRENT_SEASON = "2025-2026";

export interface RankingRow {
  id: string;
  rank: number;
  name: string;
  club: string | null;
  isActive: boolean;
  dtr: number;
  klassierung: Klassierung;
}

interface PlayerRow {
  id: string;
  name: string;
  class: string;
  pfw: number;
  club: string | null;
  is_active: boolean;
  classement_points: number | null;
}

interface MatchRow {
  player_id: string;
  new_ttr: number;
}

/**
 * Latest DTR per player this season, read straight off `matches` instead of
 * the `player_season_summary` view. The view's "latest_ttr" is a correlated
 * subquery per player, and running that for every player at once (rather
 * than one player, like the profile page does) hits Postgres's statement
 * timeout. A single indexed, sorted scan of `matches` for the season is far
 * cheaper — same lesson as the Mongo season-query timeouts hit earlier in
 * this project: batch/scan once, don't query per-player at scale.
 */
async function fetchLatestTtrByPlayer(
  supabase: SupabaseClient,
  season: string,
): Promise<Map<string, number>> {
  const pageSize = 1000;
  const { count, error: countError } = await supabase
    .from("matches")
    .select("id", { count: "exact", head: true })
    .eq("season", season);
  if (countError) throw new Error(`fetchLatestTtrByPlayer: ${countError.message}`);

  const pageCount = Math.ceil((count ?? 0) / pageSize);
  const query = (page: number) =>
    supabase
      .from("matches")
      .select("player_id, new_ttr")
      .eq("season", season)
      .order("match_date", { ascending: false })
      .order("created_at", { ascending: false })
      .range(page * pageSize, page * pageSize + pageSize - 1);

  // Each page is a fully-ordered slice (Postgres sorts before applying the
  // range), so fetching pages in parallel and processing them back in page
  // order is safe — unlike the sequential version, this doesn't wait on ~80
  // round-trips one at a time. Concurrency is capped, though: firing every
  // page at once exhausted the connection pool (both locally and, likely,
  // on Supabase's pooler under load).
  const CONCURRENCY = 8;
  const latest = new Map<string, number>();
  for (let start = 0; start < pageCount; start += CONCURRENCY) {
    const batch = await Promise.all(
      Array.from({ length: Math.min(CONCURRENCY, pageCount - start) }, (_, i) => query(start + i)),
    );
    for (const { data, error } of batch) {
      if (error) throw new Error(`fetchLatestTtrByPlayer: ${error.message}`);
      for (const row of (data ?? []) as MatchRow[]) {
        if (!latest.has(row.player_id)) latest.set(row.player_id, row.new_ttr);
      }
    }
  }
  return latest;
}

/**
 * The one place a player's current DTR is computed: their latest simulated
 * rating this season, or — if they haven't played yet this season — the
 * season-starting rating that seeds the simulation for everyone. Both
 * `/ranking` and the player profile page read from here so the numbers
 * shown always agree.
 */
export async function getRankingRows(supabase: SupabaseClient): Promise<RankingRow[]> {
  const [players, latestTtrByPlayer] = await Promise.all([
    fetchAllRows<PlayerRow>(
      supabase,
      "players",
      "id, name, class, pfw, club, is_active, classement_points",
    ),
    fetchLatestTtrByPlayer(supabase, CURRENT_SEASON),
  ]);

  const withDtr = players.map((p) => {
    const kl: PlayerClass = isPlayerClass(p.class) ? p.class : "D3";
    const seasonStart = estimateTtr(Number(p.pfw), kl, p.classement_points);
    const dtr = latestTtrByPlayer.get(p.id) ?? seasonStart ?? 1025;
    return {
      id: p.id,
      name: p.name,
      club: p.club,
      isActive: p.is_active,
      dtr,
      klassierung: klassierungForDtr(dtr),
    };
  });

  withDtr.sort((a, b) => {
    if (b.dtr !== a.dtr) return b.dtr - a.dtr;
    return a.name.localeCompare(b.name);
  });

  return withDtr.map((p, i) => ({ ...p, rank: i + 1 }));
}
