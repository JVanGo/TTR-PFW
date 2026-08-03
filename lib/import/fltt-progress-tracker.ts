import { MongoClient } from "mongodb";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isPlayerClass } from "@/lib/conversions";
import { nameKey } from "@/lib/name-key";
import { diffRangliste, type RanglistEntry } from "./verbandsrangliste";

interface MongoPlayerDoc {
  name: string;
  club: string | null;
  ranking: string;
  performanceScore: number;
}

export interface CatalogFetchResult {
  entries: RanglistEntry[];
  skipped: number;
}

/**
 * Read-only pull of the player catalog from the FLTT Progress Tracker Mongo
 * database. Maps straight onto RanglistEntry so it can feed the same
 * diffRangliste() upsert already used for the Verbandsrangliste import.
 * Rows whose `ranking` isn't A1-D3 (e.g. ZZ, NC) are dropped and counted.
 */
export async function fetchCatalogFromMongo(): Promise<CatalogFetchResult> {
  const uri = process.env.MONGODB_URI;
  const dbName = process.env.MONGODB_DB_NAME;
  if (!uri || !dbName) {
    throw new Error("Missing MONGODB_URI or MONGODB_DB_NAME.");
  }

  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 15_000 });
  try {
    await client.connect();
    const docs = await client
      .db(dbName)
      .collection<MongoPlayerDoc>("players")
      .find({}, { projection: { _id: 0, name: 1, club: 1, ranking: 1, performanceScore: 1 } })
      .toArray();

    const entries: RanglistEntry[] = [];
    let skipped = 0;
    for (const doc of docs) {
      const cls = doc.ranking?.trim().toUpperCase();
      if (!isPlayerClass(cls)) {
        skipped++;
        continue;
      }
      if (typeof doc.name !== "string" || !doc.name.trim()) {
        skipped++;
        continue;
      }
      if (!Number.isFinite(doc.performanceScore)) {
        skipped++;
        continue;
      }
      const name = doc.name.trim();
      entries.push({
        name,
        class: cls,
        pfw: doc.performanceScore,
        club: doc.club?.trim() || null,
        nameKey: nameKey(name),
      });
    }
    return { entries, skipped };
  } finally {
    await client.close();
  }
}

interface ExistingPlayer {
  id: string;
  name_key: string;
  is_active: boolean;
}

export interface ApplyCatalogSummary {
  read: number;
  skipped: number;
  existing: number;
  added: number;
  updated: number;
  deactivated: number;
}

/**
 * Fetch the catalog from Mongo and apply it to `players` via the same
 * diffRangliste() upsert the Verbandsrangliste import already uses: matched
 * players are updated, new players inserted, missing players deactivated
 * (never deleted), so existing matches and classement_points are untouched.
 * Shared between the local and production import scripts.
 */
export async function applyFlttCatalogToSupabase(
  supabase: SupabaseClient,
  log: (message: string) => void = () => {},
): Promise<ApplyCatalogSummary> {
  log("Fetching player catalog from MongoDB...");
  const { entries, skipped } = await fetchCatalogFromMongo();
  log(`  ${entries.length} players read, ${skipped} skipped (non A1-D3 ranking).`);

  log("Loading existing players from Supabase...");
  const existing: ExistingPlayer[] = [];
  let from = 0;
  const pageSize = 1000;
  for (;;) {
    const { data, error } = await supabase
      .from("players")
      .select("id, name_key, is_active")
      .range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    existing.push(...(data as ExistingPlayer[]));
    if (data.length < pageSize) break;
    from += pageSize;
  }
  log(`  ${existing.length} existing players.`);

  const diff = diffRangliste(entries, existing);

  if (diff.toInsert.length > 0) {
    log(`Inserting ${diff.toInsert.length} new players...`);
    for (let i = 0; i < diff.toInsert.length; i += 500) {
      const chunk = diff.toInsert.slice(i, i + 500).map((e: RanglistEntry) => ({
        name: e.name,
        class: e.class,
        pfw: e.pfw,
        club: e.club,
        is_active: true,
      }));
      const { error } = await supabase.from("players").insert(chunk);
      if (error) throw new Error(error.message);
    }
  }

  if (diff.toUpdate.length > 0) {
    log(`Updating ${diff.toUpdate.length} existing players...`);
    for (let i = 0; i < diff.toUpdate.length; i += 200) {
      const chunk = diff.toUpdate.slice(i, i + 200);
      await Promise.all(
        chunk.map(({ id, entry }) =>
          supabase
            .from("players")
            .update({
              name: entry.name,
              class: entry.class,
              pfw: entry.pfw,
              club: entry.club,
              is_active: true,
            })
            .eq("id", id),
        ),
      );
    }
  }

  if (diff.toDeactivate.length > 0) {
    log(`Deactivating ${diff.toDeactivate.length} players no longer in the catalog...`);
    await supabase.from("players").update({ is_active: false }).in("id", diff.toDeactivate);
  }

  return {
    read: entries.length,
    skipped,
    existing: existing.length,
    added: diff.toInsert.length,
    updated: diff.toUpdate.length,
    deactivated: diff.toDeactivate.length,
  };
}
