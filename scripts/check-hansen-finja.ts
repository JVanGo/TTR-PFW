/**
 * One-off lookup: get HANSEN Finja's flttPlayerId, profile URL, and her own
 * match rows around 2026-05-16 (CH JEU R1) so we can cross-check the Mongo
 * data against what fltt.lu itself shows on her profile page.
 *
 * Read-only. Makes no writes anywhere.
 *
 * Usage (PowerShell):
 *   npx tsx scripts/check-hansen-finja.ts
 */

import { MongoClient } from "mongodb";
import { config } from "dotenv";
import process from "node:process";

config({ path: ".env.local" });

if (!process.env.MONGODB_URI || !process.env.MONGODB_DB_NAME) {
  console.error("Missing MONGODB_URI or MONGODB_DB_NAME in .env.local");
  process.exit(1);
}

async function main() {
  const client = new MongoClient(process.env.MONGODB_URI!, { serverSelectionTimeoutMS: 15_000 });
  await client.connect();
  try {
    const db = client.db(process.env.MONGODB_DB_NAME);

    const player = await db
      .collection("players")
      .findOne({ name: /HANSEN Finja/i }, { projection: { _id: 0 } });
    console.log("Catalog record:", JSON.stringify(player, null, 2));

    if (!player) return;

    const rows = await db
      .collection("playerMatches")
      .find(
        { flttPlayerId: player.flttPlayerId, season: "25-26" },
        { projection: { _id: 0, importedAt: 0 } },
      )
      .sort({ isoDate: 1 })
      .toArray();
    console.log(`\n${rows.length} playerMatches rows for HANSEN Finja this season:`);
    for (const r of rows) {
      console.log(JSON.stringify(r));
    }
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
