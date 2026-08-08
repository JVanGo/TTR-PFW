import type { SupabaseClient } from "@supabase/supabase-js";
import { nameKey } from "@/lib/name-key";
import { fetchAllRows } from "@/lib/supabase/fetchAll";
import { KADER_PLAYERS, type KaderEntry } from "@/lib/import/kader-data";

interface PlayerRow {
  id: string;
  name_key: string;
  club: string | null;
}

/** Normalizes a club name for comparison; null/blank all compare equal. Mirrors ttr-simulation-io.ts. */
function clubKey(club: string | null): string {
  return (club ?? "").trim().toLowerCase();
}

export interface KaderMatchResult {
  matchedIds: string[];
  unmatched: KaderEntry[];
  ambiguous: KaderEntry[];
}

/**
 * Pure: resolve the Kader roster (name + club) against known players.
 * With zero or one same-name candidate, club isn't required to match; with
 * more than one (~25 name collisions exist in the FLTT catalog), an unknown
 * or non-matching club means we can't safely resolve it — reported as
 * ambiguous rather than guessed at. Same approach as ttr-simulation-io.ts's
 * resolvePlayer().
 */
export function matchKaderPlayers(entries: KaderEntry[], players: PlayerRow[]): KaderMatchResult {
  const byNameKey = new Map<string, PlayerRow[]>();
  for (const p of players) {
    const list = byNameKey.get(p.name_key);
    if (list) list.push(p);
    else byNameKey.set(p.name_key, [p]);
  }

  const matchedIds: string[] = [];
  const unmatched: KaderEntry[] = [];
  const ambiguous: KaderEntry[] = [];

  for (const entry of entries) {
    const candidates = byNameKey.get(nameKey(entry.name)) ?? [];
    if (candidates.length === 0) {
      unmatched.push(entry);
    } else if (candidates.length === 1) {
      matchedIds.push(candidates[0].id);
    } else {
      const match = candidates.find((c) => clubKey(c.club) === clubKey(entry.club));
      if (match) matchedIds.push(match.id);
      else ambiguous.push(entry);
    }
  }

  return { matchedIds, unmatched, ambiguous };
}

export async function applyKaderToSupabase(
  supabase: SupabaseClient,
  log: (message: string) => void = () => {},
): Promise<KaderMatchResult> {
  log("Loading existing players from Supabase...");
  const players = await fetchAllRows<PlayerRow>(supabase, "players", "id, name_key, club");
  log(`  ${players.length} existing players.`);

  const result = matchKaderPlayers(KADER_PLAYERS, players);

  for (const entry of result.unmatched) {
    log(`  Unmatched: ${entry.name} (${entry.club}) — not found in players table.`);
  }
  for (const entry of result.ambiguous) {
    log(`  Ambiguous: ${entry.name} (${entry.club}) — shared name, no club match.`);
  }
  log(
    `  ${result.matchedIds.length} matched, ${result.unmatched.length} unmatched, ${result.ambiguous.length} ambiguous.`,
  );

  log("Resetting is_kader for all players...");
  await supabase.from("players").update({ is_kader: false }).not("id", "is", null);

  log(`Setting is_kader = true for ${result.matchedIds.length} players...`);
  for (let i = 0; i < result.matchedIds.length; i += 200) {
    const chunk = result.matchedIds.slice(i, i + 200);
    const { error } = await supabase.from("players").update({ is_kader: true }).in("id", chunk);
    if (error) throw new Error(error.message);
  }

  return result;
}
