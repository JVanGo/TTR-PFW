import { MongoClient } from "mongodb";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isPlayerClass } from "@/lib/conversions";
import { nameKey } from "@/lib/name-key";

// Only C1-D3 estimates need classement points (see lib/conversions.ts).
const CLASSEMENT_RANKINGS = ["C1", "C2", "C3", "D1", "D2", "D3"];
const CLASSEMENT_MIN = -5.5;
const CLASSEMENT_MAX = 11.5;

// Searched most-recent-first; a player is looked up in an older season only
// if none of the newer ones had a usable value.
const SEASONS_TO_SEARCH = ["25-26", "24-25", "23-24"];

const PLAYER_BATCH_SIZE = 100;

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

/** Normalizes a club name for comparison; null/blank all compare equal. */
function clubKey(club: string | null): string {
  return (club ?? "").trim().toLowerCase();
}

interface MongoCatalogPlayerDoc {
  flttPlayerId: string;
  name: string;
  club: string | null;
  ranking: string;
}

interface MongoRencontresPointsRow {
  flttPlayerId: string;
  isoDate: string;
  points: string | null;
}

/**
 * FLTT doesn't expose classement points as a clean field. On team-competition
 * rows, `rencontresRows.points` instead holds a JSON-encoded string
 * describing that round (score, both licences, and a `points`/`pointsTemp`
 * pair for the row's own player) — individual/tournament rows leave the cell
 * blank or plain instead. A row occasionally has a human-readable delta
 * suffix, e.g. `...} (+0.5)`, which is stripped before parsing.
 *
 * Exported for testing.
 */
export function parseClassementPoints(
  raw: string | null | undefined,
  ownerFlttId: string,
): number | null {
  if (!raw || !raw.startsWith("{")) return null;
  const jsonPart = raw.replace(/\s*\([+-][\d.]+\)\s*$/, "");
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonPart);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const obj = parsed as { points?: unknown; licence1?: { licenceNumber?: unknown } };

  // Defensive: the blob is keyed on the row's own player already, but confirm
  // licence1 (when present) really is that player before trusting its points.
  const ownerLicence = obj.licence1?.licenceNumber;
  if (typeof ownerLicence === "string" && ownerLicence !== ownerFlttId) return null;

  const value = obj.points;
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  if (value < CLASSEMENT_MIN || value > CLASSEMENT_MAX) return null;
  return value;
}

interface ClassementFetchResult {
  byFlttId: Map<string, number>;
  catalog: MongoCatalogPlayerDoc[];
}

async function fetchClassementPointsFromMongo(
  log: (message: string) => void,
): Promise<ClassementFetchResult> {
  const uri = process.env.MONGODB_URI;
  const dbName = process.env.MONGODB_DB_NAME;
  if (!uri || !dbName) throw new Error("Missing MONGODB_URI or MONGODB_DB_NAME.");

  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 15_000 });
  try {
    await client.connect();
    const db = client.db(dbName);

    const catalog = await db
      .collection<MongoCatalogPlayerDoc>("players")
      .find(
        { ranking: { $in: CLASSEMENT_RANKINGS } },
        { projection: { _id: 0, flttPlayerId: 1, name: 1, club: 1, ranking: 1 } },
      )
      .toArray();

    // Latest isoDate wins per player, so a later date in a later batch must
    // still be able to overwrite an earlier one found within the same season.
    const byFlttId = new Map<string, number>();
    const isoDateByFlttId = new Map<string, string>();
    let remainingIds = catalog.map((c) => c.flttPlayerId);

    for (const season of SEASONS_TO_SEARCH) {
      if (remainingIds.length === 0) break;
      let hitsThisSeason = 0;
      for (const idBatch of chunk(remainingIds, PLAYER_BATCH_SIZE)) {
        const rows = await db
          .collection<MongoRencontresPointsRow>("rencontresRows")
          .find(
            { flttPlayerId: { $in: idBatch }, season, rowType: "match" },
            { projection: { _id: 0, flttPlayerId: 1, isoDate: 1, points: 1 }, maxTimeMS: 55_000 },
          )
          .toArray();
        for (const row of rows) {
          const value = parseClassementPoints(row.points, row.flttPlayerId);
          if (value == null) continue;
          const bestIsoDate = isoDateByFlttId.get(row.flttPlayerId);
          if (bestIsoDate && row.isoDate <= bestIsoDate) continue;
          isoDateByFlttId.set(row.flttPlayerId, row.isoDate);
          if (!byFlttId.has(row.flttPlayerId)) hitsThisSeason++;
          byFlttId.set(row.flttPlayerId, value);
        }
      }
      log(`  season ${season}: ${hitsThisSeason} new player(s) with a usable value.`);
      remainingIds = remainingIds.filter((id) => !byFlttId.has(id));
    }

    return { byFlttId, catalog };
  } finally {
    await client.close();
  }
}

interface SupabasePlayerRow {
  id: string;
  name_key: string;
  club: string | null;
  classement_points: number | null;
}

function resolvePlayer(
  playersByNameKey: Map<string, SupabasePlayerRow[]>,
  candidateNameKey: string,
  knownClub: string | null,
): SupabasePlayerRow | null {
  const candidates = playersByNameKey.get(candidateNameKey) ?? [];
  if (candidates.length <= 1) return candidates[0] ?? null;
  return candidates.find((c) => clubKey(c.club) === clubKey(knownClub)) ?? null;
}

export interface ApplyClassementPointsSummary {
  mongoPlayersWithPoints: number;
  matched: number;
  unresolved: number;
  unchanged: number;
  updated: number;
}

/**
 * Backfills `players.classement_points` for C1-D3 players from the FLTT
 * Progress Tracker Mongo dataset (see parseClassementPoints for where the
 * value actually comes from). Only ever overwrites a row when the parsed
 * value differs from what's stored — an admin's manual entry is left alone
 * unless Mongo's own value has since changed.
 */
export async function applyClassementPointsToSupabase(
  supabase: SupabaseClient,
  log: (message: string) => void = () => {},
): Promise<ApplyClassementPointsSummary> {
  log("Fetching classement points from MongoDB (this season first, older seasons as fallback)...");
  const { byFlttId, catalog } = await fetchClassementPointsFromMongo(log);
  log(`  ${byFlttId.size} of ${catalog.length} C1-D3 catalog players have a usable value.`);

  log("Loading existing players from Supabase...");
  const existing: SupabasePlayerRow[] = [];
  let from = 0;
  const pageSize = 1000;
  for (;;) {
    const { data, error } = await supabase
      .from("players")
      .select("id, name_key, club, classement_points")
      .range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    existing.push(...(data as SupabasePlayerRow[]));
    if (data.length < pageSize) break;
    from += pageSize;
  }
  log(`  ${existing.length} existing players.`);

  const playersByNameKey = new Map<string, SupabasePlayerRow[]>();
  for (const p of existing) {
    const list = playersByNameKey.get(p.name_key);
    if (list) list.push(p);
    else playersByNameKey.set(p.name_key, [p]);
  }

  let matched = 0;
  let unresolved = 0;
  let unchanged = 0;
  const toUpdate: Array<{ id: string; classement_points: number }> = [];

  for (const c of catalog) {
    if (!isPlayerClass(c.ranking?.trim().toUpperCase())) continue;
    const points = byFlttId.get(c.flttPlayerId);
    if (points == null) continue;

    const player = resolvePlayer(playersByNameKey, nameKey(c.name), c.club);
    if (!player) {
      unresolved++;
      continue;
    }
    matched++;
    if (player.classement_points === points) {
      unchanged++;
      continue;
    }
    toUpdate.push({ id: player.id, classement_points: points });
  }

  if (toUpdate.length > 0) {
    log(`Updating ${toUpdate.length} player(s)...`);
    for (const batch of chunk(toUpdate, 200)) {
      await Promise.all(
        batch.map(({ id, classement_points }) =>
          supabase.from("players").update({ classement_points }).eq("id", id),
        ),
      );
    }
  }

  return {
    mongoPlayersWithPoints: byFlttId.size,
    matched,
    unresolved,
    unchanged,
    updated: toUpdate.length,
  };
}
