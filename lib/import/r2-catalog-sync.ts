import type { SupabaseClient } from "@supabase/supabase-js";
import { isPlayerClass, type PlayerClass } from "@/lib/conversions";
import { clubKey } from "@/lib/identity-key";
import { nameKey } from "@/lib/name-key";
import { resolveClubAlias } from "./club-aliases";
import { fetchCatalogFromR2, type R2CatalogPlayerDoc } from "./r2-player-history";

interface ExistingPlayer {
  id: string;
  name: string;
  name_key: string;
  club: string | null;
  class: string;
  pfw: number;
}

export interface ClubTransfer {
  name: string;
  from: string | null;
  to: string;
}

export interface CatalogSyncSummary {
  existing: number;
  matchedInR2: number;
  classPfwUpdated: number;
  clubUpdated: number;
  clubTransfers: ClubTransfer[];
  skippedNoMatch: number;
  skippedAmbiguous: number;
  skippedNoSnapshot: number;
}

/**
 * Syncs class/PFW/club for players ALREADY tracked in Supabase from the R2
 * player-history backup — deliberately narrower than the old Mongo-based
 * applyFlttCatalogToSupabase(): no insert-new, no deactivate-missing,
 * is_active is never touched. R2 has no equivalent to Mongo's "currently
 * ranked players" ranking-crawl snapshot, so there's no safe signal here for
 * who should count as active — that's a separate decision for later.
 *
 * Club needs special care: a player's own current club isn't recorded
 * anywhere in their own R2 file, only sometimes reverse-derivable from an
 * opponent's own match rows (see fetchCatalogFromR2's clubByNameKey). Only
 * ~half of players get a hit. Every write below is a PARTIAL update that
 * omits `club` entirely when unknown — never send `club: null`, which would
 * silently wipe a real, already-known club for every unmatched player.
 *
 * Two real people sharing a name_key (confirmed ~25 cases, see
 * diffRangliste's doc comment in verbandsrangliste.ts) can't be safely
 * disambiguated here the way the Mongo/Excel importers do — R2's catalog
 * entries don't carry a per-candidate club to match against, and the
 * opponent-club reverse index is itself keyed by name only, so it would be
 * ambiguous between the two. Any name with more than one R2 candidate is
 * skipped entirely rather than risk applying one person's data to the other.
 */
export async function syncR2CatalogToSupabase(
  supabase: SupabaseClient,
  log: (message: string) => void = () => {},
): Promise<CatalogSyncSummary> {
  log("Fetching player catalog from R2...");
  const { catalog, clubByNameKey } = await fetchCatalogFromR2((done, total) => {
    if (done % 250 === 0 || done === total) {
      log(`  R2 catalog: ${done}/${total} player files fetched...`);
    }
  });
  log(`  ${catalog.length} R2 player files scanned.`);

  log("Loading existing players from Supabase...");
  const existing: ExistingPlayer[] = [];
  let from = 0;
  const pageSize = 1000;
  for (;;) {
    const { data, error } = await supabase
      .from("players")
      .select("id, name, name_key, club, class, pfw")
      .range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    existing.push(...(data as ExistingPlayer[]));
    if (data.length < pageSize) break;
    from += pageSize;
  }
  log(`  ${existing.length} existing players.`);

  const r2ByNameKey = new Map<string, R2CatalogPlayerDoc[]>();
  for (const c of catalog) {
    const key = nameKey(c.name);
    const list = r2ByNameKey.get(key);
    if (list) list.push(c);
    else r2ByNameKey.set(key, [c]);
  }

  let matchedInR2 = 0;
  let classPfwUpdated = 0;
  let clubUpdated = 0;
  let skippedNoMatch = 0;
  let skippedAmbiguous = 0;
  let skippedNoSnapshot = 0;
  const clubTransfers: ClubTransfer[] = [];
  const updates: { id: string; payload: { class?: PlayerClass; pfw?: number; club?: string } }[] =
    [];

  for (const p of existing) {
    const candidates = r2ByNameKey.get(p.name_key) ?? [];
    if (candidates.length > 1) {
      skippedAmbiguous++;
      continue;
    }
    const match = candidates[0];
    if (!match) {
      skippedNoMatch++;
      continue;
    }
    matchedInR2++;

    const payload: { class?: PlayerClass; pfw?: number; club?: string } = {};

    if (isPlayerClass(match.ranking) && Number.isFinite(match.performanceScore)) {
      if (match.ranking !== p.class || match.performanceScore !== p.pfw) {
        payload.class = match.ranking;
        payload.pfw = match.performanceScore;
        classPfwUpdated++;
      }
    } else {
      skippedNoSnapshot++;
    }

    // Two independent sources for a club change, checked in this order:
    // (1) a fresh sighting from the CURRENT season (fetchCatalogFromR2
    //     already restricts clubByNameKey to that season — see its own doc
    //     comment for why a stale-but-consistent prior-season sighting once
    //     caused a real, confirmed-wrong correction here); (2) the existing
    //     stored club itself being one of the known-defunct names (see
    //     club-aliases.ts) — that correction doesn't need fresh match
    //     evidence at all, since we already know for certain those names no
    //     longer exist, regardless of whether this player has played yet.
    const sighting = clubByNameKey.get(p.name_key);
    const aliasedExistingClub = p.club != null ? resolveClubAlias(p.club) : null;
    const newClub =
      sighting && clubKey(sighting.club) !== clubKey(p.club)
        ? sighting.club
        : aliasedExistingClub && clubKey(aliasedExistingClub) !== clubKey(p.club)
          ? aliasedExistingClub
          : null;
    if (newClub) {
      payload.club = newClub;
      clubUpdated++;
      clubTransfers.push({ name: p.name, from: p.club, to: newClub });
    }

    if (Object.keys(payload).length > 0) {
      updates.push({ id: p.id, payload });
    }
  }

  if (updates.length > 0) {
    log(`Applying ${updates.length} player updates...`);
    for (let i = 0; i < updates.length; i += 200) {
      const chunk = updates.slice(i, i + 200);
      await Promise.all(
        chunk.map(({ id, payload }) => supabase.from("players").update(payload).eq("id", id)),
      );
    }
  }

  for (const t of clubTransfers.slice(0, 30)) {
    log(`  [club transfer] ${t.name}: ${t.from ?? "(none)"} -> ${t.to}`);
  }
  if (clubTransfers.length > 30) {
    log(`  ... and ${clubTransfers.length - 30} more club transfers.`);
  }

  return {
    existing: existing.length,
    matchedInR2,
    classPfwUpdated,
    clubUpdated,
    clubTransfers,
    skippedNoMatch,
    skippedAmbiguous,
    skippedNoSnapshot,
  };
}
