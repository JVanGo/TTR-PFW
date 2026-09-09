import type { SupabaseClient } from "@supabase/supabase-js";
import { isPlayerClass, type PlayerClass } from "@/lib/conversions";
import { clubKey } from "@/lib/identity-key";
import { nameKey } from "@/lib/name-key";
import { isMatchInactive } from "@/lib/import/ttr-simulation";
import { resolveClubAlias } from "./club-aliases";
import { readSeasonStartExportFile, SEASON_START_EXPORT_PATH } from "./season-start-export";
import { fetchCatalogFromR2, type R2CatalogPlayerDoc } from "./r2-player-history";

// Only C1-D3 estimates use classement points at all (see lib/conversions.ts)
// — mirrors the same constant the old Mongo-based classement-points.ts used.
const CLASSEMENT_RANKINGS = new Set(["C1", "C2", "C3", "D1", "D2", "D3"]);

interface ExistingPlayer {
  id: string;
  name: string;
  name_key: string;
  club: string | null;
  class: string;
  pfw: number;
  classement_points: number | null;
}

export interface ClubTransfer {
  name: string;
  from: string | null;
  to: string;
}

export interface NewPlayerInsert {
  name: string;
  class: PlayerClass;
  pfw: number;
  club: string | null;
  classementPoints: number | null;
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
  inserted: number;
  insertedPlayers: NewPlayerInsert[];
  skippedNotRecentEnough: number;
  classementPointsUpdated: number;
}

/**
 * Syncs class/PFW/club for players already tracked in Supabase from the R2
 * player-history backup, and inserts genuinely new ones — deliberately
 * narrower than the old Mongo-based applyFlttCatalogToSupabase() in one way:
 * no deactivate-missing. is_active is now derived from match recency
 * elsewhere (see applyLastMatchDatesToSupabase in ttr-simulation-io.ts),
 * which already covers most of what "deactivate if missing from the
 * catalog" was for.
 *
 * Club needs special care: a player's own current club isn't recorded
 * anywhere in their own R2 file, only sometimes reverse-derivable from an
 * opponent's own match rows (see fetchCatalogFromR2's clubByNameKey). Only
 * ~half of players get a hit. Every UPDATE below is a PARTIAL update that
 * omits `club` entirely when unknown — never send `club: null`, which would
 * silently wipe a real, already-known club for every unmatched player. A
 * brand-new INSERT has no existing value to protect, so `club: null` there
 * is fine — it just means "unknown for now."
 *
 * Two real people sharing a name_key (confirmed ~25 cases, see
 * diffRangliste's doc comment in verbandsrangliste.ts) can't be safely
 * disambiguated here the way the Mongo/Excel importers do — R2's catalog
 * entries don't carry a per-candidate club to match against, and the
 * opponent-club reverse index is itself keyed by name only, so it would be
 * ambiguous between the two. Any name with more than one R2 candidate is
 * skipped entirely for updates, rather than risk applying one person's data
 * to the other. For inserts, a name_key that already has an existing
 * tracked player is skipped entirely too (not just the colliding candidate)
 * — inserting a second, distinct person under an already-used name_key
 * would make every future update for the existing player look "ambiguous"
 * and silently stop syncing them.
 *
 * New-player insertion is deliberately conservative: R2 has no "currently
 * licensed" signal like Mongo's ranking crawl did, so a name unknown to us
 * only gets inserted if they've played a graded match in the last 24
 * months — the same window as `is_active` (see fetchCatalogFromR2's
 * lastMatchIsoDate). Measured against real data 2026-09-09: of 1,270 R2
 * players not already tracked, only 31 met that bar — the rest are old,
 * no-longer-relevant history, not missed current players.
 *
 * Also folds in what used to be a separate Mongo-based importer
 * (classement-points.ts): C1-D3 players' `classement_points`, preferring
 * FLTT's own season-start export when Jeff has a copy on hand (the same
 * export ttr-simulation-io.ts already treats as authoritative) and falling
 * back to R2's derived value otherwise. Only ever overwrites the column
 * when the resolved value actually differs from what's stored, so an
 * admin's manual entry isn't clobbered unless the source value changed.
 */
export async function syncR2CatalogToSupabase(
  supabase: SupabaseClient,
  log: (message: string) => void = () => {},
): Promise<CatalogSyncSummary> {
  const exportEntries = readSeasonStartExportFile();
  const exportClassementByFlttId = new Map<string, number>();
  for (const e of exportEntries) {
    if (e.classementPoints != null)
      exportClassementByFlttId.set(e.flttPlayerId, e.classementPoints);
  }
  log(
    exportEntries.length > 0
      ? `  ${exportClassementByFlttId.size} players have a classement value in ${SEASON_START_EXPORT_PATH}.`
      : `  No season-start export found at ${SEASON_START_EXPORT_PATH} — using R2 match history only.`,
  );

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
      .select("id, name, name_key, club, class, pfw, classement_points")
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
  let classementPointsUpdated = 0;
  const clubTransfers: ClubTransfer[] = [];
  const updates: {
    id: string;
    payload: { class?: PlayerClass; pfw?: number; club?: string; classement_points?: number };
  }[] = [];

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

    const payload: {
      class?: PlayerClass;
      pfw?: number;
      club?: string;
      classement_points?: number;
    } = {};

    if (isPlayerClass(match.ranking) && Number.isFinite(match.performanceScore)) {
      if (match.ranking !== p.class || match.performanceScore !== p.pfw) {
        payload.class = match.ranking;
        payload.pfw = match.performanceScore;
        classPfwUpdated++;
      }

      if (CLASSEMENT_RANKINGS.has(match.ranking)) {
        const points = exportClassementByFlttId.get(match.flttPlayerId) ?? match.classementPoints;
        if (points != null && points !== p.classement_points) {
          payload.classement_points = points;
          classementPointsUpdated++;
        }
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

  // New players: any R2 name with no existing Supabase candidate at all,
  // recent enough to trust (see the doc comment above for why).
  const existingNameKeys = new Set(existing.map((p) => p.name_key));
  const today = new Date().toISOString().slice(0, 10);
  const insertedPlayers: NewPlayerInsert[] = [];
  let skippedNotRecentEnough = 0;

  for (const [key, candidates] of r2ByNameKey) {
    if (existingNameKeys.has(key)) continue;
    for (const c of candidates) {
      if (!isPlayerClass(c.ranking) || !Number.isFinite(c.performanceScore)) continue;
      const isRecentlyActive =
        c.lastMatchIsoDate != null && !isMatchInactive(c.lastMatchIsoDate, today);
      if (!isRecentlyActive) {
        skippedNotRecentEnough++;
        continue;
      }
      const sighting = clubByNameKey.get(key);
      const classementPoints = CLASSEMENT_RANKINGS.has(c.ranking)
        ? (exportClassementByFlttId.get(c.flttPlayerId) ?? c.classementPoints)
        : null;
      insertedPlayers.push({
        name: c.name,
        class: c.ranking,
        pfw: c.performanceScore,
        club: sighting ? sighting.club : null,
        classementPoints,
      });
    }
  }

  if (insertedPlayers.length > 0) {
    log(`Inserting ${insertedPlayers.length} new players...`);
    for (let i = 0; i < insertedPlayers.length; i += 500) {
      const chunk = insertedPlayers.slice(i, i + 500).map((c) => ({
        name: c.name,
        class: c.class,
        pfw: c.pfw,
        club: c.club,
        classement_points: c.classementPoints,
        is_active: true,
      }));
      const { error } = await supabase.from("players").insert(chunk);
      if (error) throw new Error(error.message);
    }
    for (const c of insertedPlayers.slice(0, 30)) {
      log(`  [new player] ${c.name} (${c.class}, ${c.pfw}${c.club ? `, ${c.club}` : ""})`);
    }
    if (insertedPlayers.length > 30) {
      log(`  ... and ${insertedPlayers.length - 30} more new players.`);
    }
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
    inserted: insertedPlayers.length,
    insertedPlayers,
    skippedNotRecentEnough,
    classementPointsUpdated,
  };
}
