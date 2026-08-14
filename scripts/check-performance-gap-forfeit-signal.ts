/**
 * One-off, read-only check for an idea Jeff had: on a player's fltt.lu
 * profile, a game that shows up in the "Games recorded" table (Rencontres)
 * but NOT in the "Performance calculation" table below it might be a
 * forfeit. Mongo stores this directly as `playerMatches.hasPerformance`.
 *
 * This script doesn't change any forfeit-detection logic. It just measures,
 * against forfeits we already know about (Forfaits.xlsx + FLTT's own
 * internal marker — see lib/import/forfeits.ts), how well "missing from the
 * Performance table" lines up with "is actually a forfeit":
 *
 *   - Recall: of the forfeits we already know about, what fraction are
 *     missing from the Performance table?
 *   - Precision: of the rows missing from the Performance table (excluding
 *     TOU tournament games, which are already known to lack Performance
 *     rows for reasons unrelated to forfeits), what fraction are actually
 *     known forfeits vs. something else?
 *
 * Makes no writes anywhere — only reads from MongoDB. Safe to run any time.
 *
 * Usage (PowerShell):
 *   npx tsx scripts/check-performance-gap-forfeit-signal.ts
 */

import { MongoClient } from "mongodb";
import { config } from "dotenv";
import process from "node:process";

import {
  excludeKnownFalsePositives,
  findMarkerOnlyForfeits,
  FORFEIT_EXCLUSIONS,
  matchForfeits,
  readForfeitsFile,
  type MatchCandidateRow,
} from "../lib/import/forfeits";
import { FORFEIT_OVERRIDES } from "../lib/import/forfeit-overrides";

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
  won: boolean | null;
  hasPerformance: boolean;
  rencontres?: { competition?: string; round?: string; matchLabel?: string; points?: string };
}

function resolveCompetition(m: Pick<MongoPlayerMatchDoc, "competition" | "rencontres">): string {
  return m.competition?.trim() || m.rencontres?.competition?.trim() || "";
}

function hasForfeitMarker(m: Pick<MongoPlayerMatchDoc, "rencontres">): boolean {
  return (m.rencontres?.points ?? "").includes('"forfeit":true');
}

function isTournament(competition: string): boolean {
  const upper = competition.toUpperCase();
  return upper.startsWith("TOU ") || upper === "TOU";
}

// playerMatches is only indexed leading with flttPlayerId (see
// Dataset/DATASET_HANDOFF.md section 9), so a query scoped to `season` alone
// is a full-collection scan that reliably times out on Cosmos DB — same fix
// as fetchInPlayerBatches in lib/import/ttr-simulation-io.ts.
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
              "rencontres.round": 1,
              "rencontres.matchLabel": 1,
              "rencontres.points": 1,
              score: 1,
              won: 1,
              hasPerformance: 1,
            },
            maxTimeMS: 55_000,
          },
        )
        .toArray();
      seasonMatches.push(...docs);
    }
    console.log(`  ${seasonMatches.length} match rows.`);

    // Same ground-truth forfeit detection the real pipeline uses.
    const forfeitEntries = readForfeitsFile();
    const candidateRows: MatchCandidateRow[] = seasonMatches.map((m) => ({
      id: m.id,
      flttPlayerId: m.flttPlayerId,
      round: m.rencontres?.round != null ? Number(m.rencontres.round) : null,
      competition: resolveCompetition(m),
      matchLabel: m.rencontres?.matchLabel ?? null,
      score: m.score,
      isoDate: m.isoDate,
      opponentName: m.opponentName,
      hasForfeitMarker: hasForfeitMarker(m),
    }));
    const { forfeitedRowIds: xlsxIds } = matchForfeits(
      candidateRows,
      forfeitEntries,
      FORFEIT_OVERRIDES,
    );
    const { forfeitedRowIds: markerIds } = findMarkerOnlyForfeits(candidateRows, xlsxIds);
    const knownForfeitIds = excludeKnownFalsePositives(
      candidateRows,
      new Set([...xlsxIds, ...markerIds]),
      FORFEIT_EXCLUSIONS,
    );
    console.log(`  ${knownForfeitIds.size} known forfeits (existing detection, ground truth).`);

    const byId = new Map(seasonMatches.map((m) => [m.id, m]));

    // --- Recall: of the known forfeits, how many are missing from Performance? ---
    let forfeitsMissingPerf = 0;
    const forfeitsNotMissing: string[] = [];
    for (const id of knownForfeitIds) {
      const m = byId.get(id);
      if (!m) continue;
      if (!m.hasPerformance) forfeitsMissingPerf++;
      else forfeitsNotMissing.push(id);
    }

    // --- Precision: of rows missing from Performance (excl. tournaments), how many are known forfeits? ---
    const missingNonTournament = seasonMatches.filter(
      (m) => !m.hasPerformance && !isTournament(resolveCompetition(m)),
    );
    const missingTournament = seasonMatches.filter(
      (m) => !m.hasPerformance && isTournament(resolveCompetition(m)),
    );
    const missingNonTournamentForfeits = missingNonTournament.filter((m) =>
      knownForfeitIds.has(m.id),
    );
    const missingNonTournamentFalsePositives = missingNonTournament.filter(
      (m) => !knownForfeitIds.has(m.id),
    );

    console.log("\n=== Recall (does the gap catch our known forfeits?) ===");
    console.log(
      `${forfeitsMissingPerf} / ${knownForfeitIds.size} known forfeits are missing from the ` +
        `Performance table (${((forfeitsMissingPerf / Math.max(knownForfeitIds.size, 1)) * 100).toFixed(1)}%).`,
    );
    if (forfeitsNotMissing.length > 0) {
      console.log(
        `${forfeitsNotMissing.length} known forfeits DO have a Performance row anyway — the gap ` +
          `would miss these:`,
      );
      for (const id of forfeitsNotMissing.slice(0, 10)) {
        const m = byId.get(id)!;
        console.log(
          `  ${m.flttPlayerId} ${m.playerName} vs ${m.opponentName} ${m.isoDate} ${m.score}`,
        );
      }
    }

    console.log("\n=== Precision (excluding TOU tournaments, is the gap mostly forfeits?) ===");
    console.log(
      `${missingTournament.length} rows missing from Performance ARE tournament games (excluded).`,
    );
    console.log(
      `${missingNonTournament.length} rows missing from Performance are non-tournament: ` +
        `${missingNonTournamentForfeits.length} are known forfeits, ` +
        `${missingNonTournamentFalsePositives.length} are NOT (would be false positives).`,
    );
    const precision =
      missingNonTournamentForfeits.length / Math.max(missingNonTournament.length, 1);
    console.log(`Precision (non-tournament): ${(precision * 100).toFixed(1)}%.`);

    if (missingNonTournamentFalsePositives.length > 0) {
      console.log(
        `\nSample of non-tournament, non-forfeit rows missing from Performance (up to 15):`,
      );
      for (const m of missingNonTournamentFalsePositives.slice(0, 15)) {
        console.log(
          `  ${m.flttPlayerId} ${m.playerName} vs ${m.opponentName} — ${m.isoDate} — ` +
            `${resolveCompetition(m)} — score ${m.score}`,
        );
      }
    }
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
