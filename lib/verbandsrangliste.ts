import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * The Verbandsrangliste: every active player's DTR frozen at the start of a
 * Teilrunde. Teams in any NL division line up in its order (see
 * lib/lineup.ts's startingOrder), not by current DTR.
 */
export type Teilrunde = 1 | 2;

/** "2026-2027", 1 -> "2026-08-01"; "2026-2027", 2 -> "2027-01-01". */
export function snapshotDateFor(season: string, teilrunde: Teilrunde): string {
  const [startYear, endYear] = season.split("-").map(Number);
  return teilrunde === 1 ? `${startYear}-08-01` : `${endYear}-01-01`;
}

/** The latest Teilrunde of `season` whose snapshot date has arrived, or null before it starts. */
export function currentTeilrunde(season: string, todayIso: string): Teilrunde | null {
  if (todayIso >= snapshotDateFor(season, 2)) return 2;
  if (todayIso >= snapshotDateFor(season, 1)) return 1;
  return null;
}

export interface Snapshot {
  teilrunde: Teilrunde;
  dtrByPlayer: Map<string, number>;
}

/** Which Teilrunde the newest snapshot taken for `season` is for, or null if none has been taken yet. */
export async function fetchLatestSnapshotTeilrunde(
  supabase: SupabaseClient,
  season: string,
): Promise<Teilrunde | null> {
  const { data, error } = await supabase
    .from("verbandsrangliste_snapshots")
    .select("teilrunde")
    .eq("season", season)
    .order("teilrunde", { ascending: false })
    .limit(1);
  if (error) throw new Error(`fetchLatestSnapshotTeilrunde: ${error.message}`);
  return data && data.length > 0 ? (data[0].teilrunde as Teilrunde) : null;
}

export interface SnapshotListRow {
  name: string;
  club: string | null;
  dtr: number;
}

/** One snapshot as a printable list, strongest first (ties by name) — for the PDF download. */
export async function fetchSnapshotList(
  supabase: SupabaseClient,
  season: string,
  teilrunde: Teilrunde,
): Promise<SnapshotListRow[]> {
  const pageSize = 1000;
  const rows: SnapshotListRow[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("verbandsrangliste_snapshots")
      .select("dtr, club, players(name)")
      .eq("season", season)
      .eq("teilrunde", teilrunde)
      .order("player_id")
      .range(from, from + pageSize - 1);
    if (error) throw new Error(`fetchSnapshotList: ${error.message}`);
    for (const row of (data ?? []) as unknown as {
      dtr: number;
      club: string | null;
      players: { name: string } | null;
    }[]) {
      rows.push({ name: row.players?.name ?? "", club: row.club, dtr: row.dtr });
    }
    if (!data || data.length < pageSize) break;
  }
  return rows.sort((a, b) => b.dtr - a.dtr || a.name.localeCompare(b.name));
}

/** The newest snapshot taken for `season`, or null if none has been taken yet. */
export async function fetchLatestSnapshot(
  supabase: SupabaseClient,
  season: string,
): Promise<Snapshot | null> {
  const teilrunde = await fetchLatestSnapshotTeilrunde(supabase, season);
  if (teilrunde == null) return null;

  const pageSize = 1000;
  const dtrByPlayer = new Map<string, number>();
  for (let from = 0; ; from += pageSize) {
    // Ordered by player_id, unique within one snapshot, so pages never overlap.
    const { data, error: pageError } = await supabase
      .from("verbandsrangliste_snapshots")
      .select("player_id, dtr")
      .eq("season", season)
      .eq("teilrunde", teilrunde)
      .order("player_id")
      .range(from, from + pageSize - 1);
    if (pageError) throw new Error(`fetchLatestSnapshot: ${pageError.message}`);
    for (const row of data ?? []) dtrByPlayer.set(row.player_id, row.dtr);
    if (!data || data.length < pageSize) break;
  }
  return { teilrunde, dtrByPlayer };
}
