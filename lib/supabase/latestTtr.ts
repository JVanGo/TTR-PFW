import type { SupabaseClient } from "@supabase/supabase-js";
import { computeStartingDtr, type MatchForStartingDtr } from "@/lib/starting-dtr";

export interface LatestTtrRow {
  player_id: string;
  match_date: string;
  ttr_delta: number;
  new_ttr: number;
}

/**
 * Picks each player's final rating from their rows, in any order. Only the
 * rows on a player's last day matter. Every match on one day settles to the
 * same rating, but the boundary-day adjustments don't: on Jan 1 / Aug 1 a
 * youth player can get the Ersteinstufung floor and then the growth bonus on
 * top, two rows with different ratings and (being inserted in one batch) the
 * same created_at, so nothing in the table orders them. Each adjustment
 * starts from the rating the previous one ended on, so the final rating is
 * the one no other same-day row starts from.
 */
export function pickLatestTtr(rows: LatestTtrRow[]): Map<string, number> {
  const lastDay = new Map<string, { date: string; rows: LatestTtrRow[] }>();
  for (const row of rows) {
    const day = lastDay.get(row.player_id);
    if (!day || row.match_date > day.date) {
      lastDay.set(row.player_id, { date: row.match_date, rows: [row] });
    } else if (row.match_date === day.date) {
      day.rows.push(row);
    }
  }

  const latest = new Map<string, number>();
  for (const [playerId, day] of lastDay) {
    const startsFrom = new Set(day.rows.map((r) => r.new_ttr - r.ttr_delta));
    const ends = [...new Set(day.rows.map((r) => r.new_ttr))].filter((t) => !startsFrom.has(t));
    // No unique chain end (e.g. a plain matchday, where every row shares one
    // rating): fall back to the highest, which is that shared rating.
    latest.set(playerId, ends.length === 1 ? ends[0] : Math.max(...day.rows.map((r) => r.new_ttr)));
  }
  return latest;
}

/**
 * Each player's latest `new_ttr` for a given season, read straight off
 * `matches` via a single paged scan rather than one correlated subquery per
 * player (which hits Postgres's statement timeout at this table's size —
 * same lesson as the Mongo season-query timeouts elsewhere in this project:
 * batch/scan once, don't query per-player at scale).
 */
export async function fetchLatestTtrByPlayer(
  supabase: SupabaseClient,
  season: string,
): Promise<Map<string, number>> {
  return pickLatestTtr(
    await fetchSeasonRows<LatestTtrRow>(
      supabase,
      season,
      "player_id, match_date, ttr_delta, new_ttr",
    ),
  );
}

/**
 * Each player's rating as it stood at the end of `asOfIso`, for the
 * Verbandsrangliste snapshot: their latest rating from rows on or before
 * that day (so the youth adjustments dated on the day itself count), or, if
 * their first row this season comes later, the rating they started the
 * season with. Players with no row this season at all are left out.
 */
export async function fetchTtrAsOfByPlayer(
  supabase: SupabaseClient,
  season: string,
  asOfIso: string,
): Promise<Map<string, number>> {
  return pickTtrAsOf(
    await fetchSeasonRows<LatestTtrRow & MatchForStartingDtr>(
      supabase,
      season,
      "player_id, match_date, competition, ttr_delta, new_ttr",
    ),
    asOfIso,
  );
}

/** The pure part of fetchTtrAsOfByPlayer: rows in any order. */
export function pickTtrAsOf(
  rows: (LatestTtrRow & MatchForStartingDtr)[],
  asOfIso: string,
): Map<string, number> {
  const asOf = pickLatestTtr(rows.filter((r) => r.match_date <= asOfIso));

  const laterRowsByPlayer = new Map<string, MatchForStartingDtr[]>();
  for (const row of rows) {
    if (asOf.has(row.player_id)) continue;
    const list = laterRowsByPlayer.get(row.player_id) ?? [];
    list.push(row);
    laterRowsByPlayer.set(row.player_id, list);
  }
  for (const [playerId, list] of laterRowsByPlayer) {
    list.sort((a, b) => a.match_date.localeCompare(b.match_date));
    const start = computeStartingDtr(list);
    if (start != null) asOf.set(playerId, start);
  }
  return asOf;
}

/** Every `matches` row of one season, selecting `columns` — see fetchLatestTtrByPlayer. */
async function fetchSeasonRows<Row>(
  supabase: SupabaseClient,
  season: string,
  columns: string,
): Promise<Row[]> {
  const pageSize = 1000;
  const { count, error: countError } = await supabase
    .from("matches")
    .select("id", { count: "exact", head: true })
    .eq("season", season);
  if (countError) throw new Error(`fetchSeasonRows: ${countError.message}`);

  const pageCount = Math.ceil((count ?? 0) / pageSize);
  // Paged by `id` alone: the ordering has to be unique, or Postgres is free
  // to order tied rows differently for each page and some rows get skipped
  // or read twice. Ordering by match_date + created_at wasn't unique (every
  // row of one insert batch shares a created_at), which silently picked an
  // earlier day's rating for ~100 players per run, differently each time.
  const query = (page: number) =>
    supabase
      .from("matches")
      .select(columns)
      .eq("season", season)
      .order("id")
      .range(page * pageSize, page * pageSize + pageSize - 1);

  // Pages are fetched in parallel rather than one round-trip at a time.
  // Concurrency is capped, though: firing every page at once exhausted the
  // connection pool (both locally and, likely, on Supabase's pooler under
  // load).
  const CONCURRENCY = 8;
  const rows: Row[] = [];
  for (let start = 0; start < pageCount; start += CONCURRENCY) {
    const batch = await Promise.all(
      Array.from({ length: Math.min(CONCURRENCY, pageCount - start) }, (_, i) => query(start + i)),
    );
    for (const { data, error } of batch) {
      if (error) throw new Error(`fetchSeasonRows: ${error.message}`);
      rows.push(...((data ?? []) as Row[]));
    }
  }
  return rows;
}
