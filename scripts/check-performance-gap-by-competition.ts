/**
 * Follow-up to check-performance-gap-forfeit-signal.ts: that script found
 * ~2,475 non-tournament, non-forfeit games this season missing a joined
 * Performance-table row — 3x more than the real forfeits mixed in. This
 * script digs into WHY, for two competing explanations:
 *
 *   (a) FLTT just doesn't compute a Performance value for certain
 *       competition types (e.g. some interclub divisions) — nothing to fix,
 *       "missing" is expected there.
 *   (b) The Progress Tracker's crawler/join logic is failing to match an
 *       existing Performance row to its Rencontres row for those
 *       competitions (a join-key mismatch) — the data exists but didn't
 *       link up.
 *
 * (a) predicts: those competitions have a Performance-missing rate close to
 * 100% for EVERY player in them, and no trace of the "missing" games shows
 * up in `unmatchedPerformanceRows` (nothing to join in the first place).
 *
 * (b) predicts: `unmatchedPerformanceRows` has entries for the same
 * players/dates/opponents — a Performance row was crawled but the join
 * missed it.
 *
 * Read-only. Makes no writes anywhere.
 *
 * Usage (PowerShell):
 *   npx tsx scripts/check-performance-gap-by-competition.ts
 */

import { MongoClient } from "mongodb";
import { config } from "dotenv";
import process from "node:process";

config({ path: ".env.local" });

const MONGO_SEASON = "25-26";

if (!process.env.MONGODB_URI || !process.env.MONGODB_DB_NAME) {
  console.error("Missing MONGODB_URI or MONGODB_DB_NAME in .env.local");
  process.exit(1);
}

interface MongoPlayerMatchDoc {
  id: string;
  flttPlayerId: string;
  playerName: string;
  opponentName: string;
  isoDate: string;
  competition: string;
  score: string | null;
  hasPerformance: boolean;
  rencontres?: { competition?: string };
}

function resolveCompetition(m: Pick<MongoPlayerMatchDoc, "competition" | "rencontres">): string {
  return m.competition?.trim() || m.rencontres?.competition?.trim() || "";
}

function isTournament(competition: string): boolean {
  const upper = competition.toUpperCase();
  return upper.startsWith("TOU ") || upper === "TOU";
}

/** "CH SEN N2-D5 (R2)" -> "CH SEN N2-D5"; "NL1 (R2)" -> "NL1". Strips the
 * half-season "(Rx)" suffix so the two halves of a league group together. */
function competitionFamily(competition: string): string {
  return competition.replace(/\s*\(R\d+\)\s*$/, "").trim();
}

const PLAYER_BATCH_SIZE = 100;
function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

async function main() {
  const client = new MongoClient(process.env.MONGODB_URI!, { serverSelectionTimeoutMS: 15_000 });
  await client.connect();
  console.log(`Target: ${process.env.MONGODB_DB_NAME}`);

  try {
    const db = client.db(process.env.MONGODB_DB_NAME);

    console.log("Fetching player catalog (for batching)...");
    const playerIds = (
      await db
        .collection<{ flttPlayerId: string }>("players")
        .find({}, { projection: { _id: 0, flttPlayerId: 1 } })
        .toArray()
    ).map((p) => p.flttPlayerId);
    console.log(`  ${playerIds.length} players.`);

    console.log(`Fetching season ${MONGO_SEASON} match rows (batched by player)...`);
    const seasonMatches: MongoPlayerMatchDoc[] = [];
    for (const idBatch of chunk(playerIds, PLAYER_BATCH_SIZE)) {
      const docs = await db
        .collection<MongoPlayerMatchDoc>("playerMatches")
        .find(
          { flttPlayerId: { $in: idBatch }, season: MONGO_SEASON },
          {
            projection: {
              _id: 0,
              id: 1,
              flttPlayerId: 1,
              playerName: 1,
              opponentName: 1,
              isoDate: 1,
              competition: 1,
              "rencontres.competition": 1,
              score: 1,
              hasPerformance: 1,
            },
            maxTimeMS: 55_000,
          },
        )
        .toArray();
      seasonMatches.push(...docs);
    }
    console.log(`  ${seasonMatches.length} match rows.\n`);

    // --- Part 1: missing-rate by competition family, non-tournament only ---
    interface Stat {
      total: number;
      missing: number;
      players: Set<string>;
      playersFullyMissing: number;
    }
    const byFamily = new Map<string, Stat>();
    const rowsByFamily = new Map<string, MongoPlayerMatchDoc[]>();
    for (const m of seasonMatches) {
      const comp = resolveCompetition(m);
      if (isTournament(comp)) continue;
      const family = competitionFamily(comp);
      if (!family) continue;
      let s = byFamily.get(family);
      if (!s) {
        s = { total: 0, missing: 0, players: new Set(), playersFullyMissing: 0 };
        byFamily.set(family, s);
      }
      s.total++;
      s.players.add(m.flttPlayerId);
      if (!m.hasPerformance) s.missing++;
      const list = rowsByFamily.get(family);
      if (list) list.push(m);
      else rowsByFamily.set(family, [m]);
    }

    // Per family, how many of its players have EVERY one of their rows in
    // that family missing performance (vs. a mix) — a clean split suggests
    // "this competition type just isn't tracked", a mix suggests something
    // row-specific (more consistent with a join failure).
    for (const [family, rows] of rowsByFamily) {
      const byPlayer = new Map<string, MongoPlayerMatchDoc[]>();
      for (const r of rows) {
        const list = byPlayer.get(r.flttPlayerId);
        if (list) list.push(r);
        else byPlayer.set(r.flttPlayerId, [r]);
      }
      let fullyMissing = 0;
      for (const playerRows of byPlayer.values()) {
        if (playerRows.every((r) => !r.hasPerformance)) fullyMissing++;
      }
      byFamily.get(family)!.playersFullyMissing = fullyMissing;
    }

    const ranked = [...byFamily.entries()]
      .filter(([, s]) => s.missing > 0)
      .sort((a, b) => b[1].missing - a[1].missing);

    console.log("=== Non-tournament competitions with missing Performance rows ===");
    console.log(
      "family | total rows | missing | missing% | players affected | players 100% missing in this family\n",
    );
    for (const [family, s] of ranked.slice(0, 20)) {
      const pct = ((s.missing / s.total) * 100).toFixed(0);
      console.log(
        `${family.padEnd(20)} ${String(s.total).padStart(6)} ${String(s.missing).padStart(8)} ` +
          `${pct.padStart(6)}%  players=${s.players.size} allMissing=${s.playersFullyMissing}`,
      );
    }

    // --- Part 2: for the biggest offending family, check unmatchedPerformanceRows ---
    // Skip COU FELTEN — already known to be a non-rated competition (see
    // NON_RATED_COMPETITION_PREFIXES in lib/import/ttr-simulation.ts), so a
    // 100% missing rate there is expected, not a mystery worth digging into.
    const topFamily = ranked.find(([family]) => !family.startsWith("COU FELTEN"))?.[0];
    if (topFamily) {
      console.log(
        `\n=== Checking 'unmatchedPerformanceRows' for the top family: "${topFamily}" ===`,
      );
      const affectedRows = rowsByFamily.get(topFamily)!.filter((r) => !r.hasPerformance);
      const affectedPlayerIds = [...new Set(affectedRows.map((r) => r.flttPlayerId))].slice(0, 50);

      const unmatched = await db
        .collection("unmatchedPerformanceRows")
        .find(
          { flttPlayerId: { $in: affectedPlayerIds }, season: MONGO_SEASON },
          { projection: { _id: 0, flttPlayerId: 1, isoDate: 1, competition: 1, opponentName: 1 } },
        )
        .toArray();
      console.log(
        `${unmatched.length} unmatchedPerformanceRows found for these ${affectedPlayerIds.length} ` +
          `players this season (evidence of a join failure, if any).`,
      );
      if (unmatched.length > 0) {
        console.log("Sample:");
        for (const u of unmatched.slice(0, 10)) {
          console.log(`  ${u.flttPlayerId} ${u.isoDate} ${u.competition} vs ${u.opponentName}`);
        }
      }

      // Also: do these players have ANY performanceRows at all this season,
      // in ANY competition? Zero would support "performance isn't tracked
      // for them/this competition type at all" rather than a per-row miss.
      const perfRowCounts = await db
        .collection("performanceRows")
        .aggregate([
          { $match: { flttPlayerId: { $in: affectedPlayerIds }, season: MONGO_SEASON } },
          { $group: { _id: "$flttPlayerId", count: { $sum: 1 } } },
        ])
        .toArray();
      const withAnyPerf = perfRowCounts.filter((r) => r.count > 0).length;
      console.log(
        `${withAnyPerf} / ${affectedPlayerIds.length} affected players have AT LEAST ONE ` +
          `performanceRows entry this season (in any competition).`,
      );
    }
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
