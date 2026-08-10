import type { SupabaseClient } from "@supabase/supabase-js";

interface MatchRow {
  player_id: string;
  new_ttr: number;
}

/**
 * Each player's latest `new_ttr` for a given season, read straight off
 * `matches` via a single indexed, sorted scan rather than one correlated
 * subquery per player (which hits Postgres's statement timeout at this
 * table's size — same lesson as the Mongo season-query timeouts elsewhere in
 * this project: batch/scan once, don't query per-player at scale).
 */
export async function fetchLatestTtrByPlayer(
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
  // order is safe — unlike a sequential version, this doesn't wait on dozens
  // of round-trips one at a time. Concurrency is capped, though: firing every
  // page at once exhausted the connection pool (both locally and, likely, on
  // Supabase's pooler under load).
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
