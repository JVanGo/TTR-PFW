import { MongoClient } from "mongodb";
import { isPlayerClass } from "@/lib/conversions";
import { nameKey } from "@/lib/name-key";
import type { RanglistEntry } from "./verbandsrangliste";

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
