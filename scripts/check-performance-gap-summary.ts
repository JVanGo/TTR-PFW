/**
 * Final consolidated pass. Combines everything found by the earlier
 * check-performance-gap-*.ts scripts into one clean breakdown of WHY a game
 * is missing from a player's Performance table, for the current season.
 *
 * Excludes two already-understood, unrelated causes before counting anything
 * as a "mystery":
 *   - TOU tournament games (never get a Performance row, unrelated to
 *     forfeits — noted directly in lib/import/ttr-simulation-io.ts).
 *   - COU FELTEN cup ties (FLTT doesn't rate this competition at all — see
 *     NON_RATED_COMPETITION_PREFIXES in lib/import/ttr-simulation.ts — so of
 *     course there's no Performance row for it, on either side).
 *
 * Read-only. Makes no writes anywhere.
 *
 * Usage (PowerShell):
 *   npx tsx scripts/check-performance-gap-summary.ts
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
import { nameKey } from "../lib/name-key";

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
// Same list as NON_RATED_COMPETITION_PREFIXES in lib/import/ttr-simulation.ts.
const NON_RATED_PREFIXES = ["COU FELTEN"];
function isNonRated(competition: string): boolean {
  const upper = competition.toUpperCase();
  return NON_RATED_PREFIXES.some((p) => upper.startsWith(p));
}
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

    const catalog = await db
      .collection<{ flttPlayerId: string; name: string; flttUrl?: string }>("players")
      .find({}, { projection: { _id: 0, flttPlayerId: 1, name: 1, flttUrl: 1 } })
      .toArray();
    const playerIds = catalog.map((p) => p.flttPlayerId);
    const flttUrlById = new Map(catalog.map((c) => [c.flttPlayerId, c.flttUrl ?? ""]));

    const catalogByNameKey = new Map<string, string[]>();
    for (const c of catalog) {
      const key = nameKey(c.name);
      const list = catalogByNameKey.get(key);
      if (list) list.push(c.flttPlayerId);
      else catalogByNameKey.set(key, [c.flttPlayerId]);
    }
    function resolveFlttId(playerName: string): string | null {
      const candidates = catalogByNameKey.get(nameKey(playerName)) ?? [];
      return candidates.length === 1 ? candidates[0] : null;
    }

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
              hasPerformance: 1,
            },
            maxTimeMS: 55_000,
          },
        )
        .toArray();
      seasonMatches.push(...docs);
    }
    console.log(`  ${seasonMatches.length} total match rows this season.\n`);

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

    const rowIndex = new Map<string, MongoPlayerMatchDoc>();
    function indexKey(flttPlayerId: string, isoDate: string, family: string, opponentNK: string) {
      return `${flttPlayerId}|${isoDate}|${family}|${opponentNK}`;
    }
    for (const m of seasonMatches) {
      rowIndex.set(
        indexKey(
          m.flttPlayerId,
          m.isoDate,
          competitionFamily(resolveCompetition(m)),
          nameKey(m.opponentName),
        ),
        m,
      );
    }

    // The "rated" population: excludes TOU and COU FELTEN, the two causes
    // already known to be unrelated to forfeits.
    const ratedRows = seasonMatches.filter((m) => {
      const comp = resolveCompetition(m);
      return !isTournament(comp) && !isNonRated(comp);
    });
    const ratedMissing = ratedRows.filter((m) => !m.hasPerformance);
    const ratedKnownForfeits = ratedRows.filter((m) => knownForfeitIds.has(m.id));
    const ratedKnownForfeitsMissing = ratedKnownForfeits.filter((m) => !m.hasPerformance);

    console.log("=== Rated competitions only (excludes TOU tournaments + COU FELTEN cup) ===");
    console.log(`${ratedRows.length} rated rows, ${ratedMissing.length} missing Performance.`);
    console.log(
      `${ratedKnownForfeits.length} known forfeits, ${ratedKnownForfeitsMissing.length} of them missing ` +
        `Performance (${((ratedKnownForfeitsMissing.length / Math.max(ratedKnownForfeits.length, 1)) * 100).toFixed(1)}% recall).\n`,
    );

    const mystery = ratedMissing.filter((m) => !knownForfeitIds.has(m.id));
    console.log(`${mystery.length} missing rows are NOT a known forfeit — breaking these down:\n`);

    let mirrorIsKnownForfeit = 0;
    let mirrorMissingToo = 0;
    let mirrorNormal = 0;
    let mirrorNotFound = 0;
    let opponentUnresolved = 0;
    const genuineMystery: MongoPlayerMatchDoc[] = [];

    for (const m of mystery) {
      const oppId = resolveFlttId(m.opponentName);
      if (!oppId) {
        opponentUnresolved++;
        continue;
      }
      const mirror = rowIndex.get(
        indexKey(oppId, m.isoDate, competitionFamily(resolveCompetition(m)), nameKey(m.playerName)),
      );
      if (!mirror) {
        mirrorNotFound++;
        continue;
      }
      if (knownForfeitIds.has(mirror.id)) mirrorIsKnownForfeit++;
      else if (!mirror.hasPerformance) {
        mirrorMissingToo++;
        genuineMystery.push(m);
      } else {
        mirrorNormal++;
        genuineMystery.push(m);
      }
    }

    console.log(
      `  ${mirrorIsKnownForfeit} — winning side of an already-known forfeit (not actually a problem)`,
    );
    console.log(
      `  ${mirrorMissingToo} — mirror ALSO missing, neither side a known forfeit (real mystery)`,
    );
    console.log(`  ${mirrorNormal} — mirror has Performance fine (real mystery)`);
    console.log(`  ${mirrorNotFound} — no mirror row found in our data`);
    console.log(`  ${opponentUnresolved} — opponent name didn't resolve to one player`);

    const explainedByForfeit = mirrorIsKnownForfeit;
    const cleanPrecisionDenominator = mystery.length - opponentUnresolved - mirrorNotFound;
    console.log(
      `\nOf ${cleanPrecisionDenominator} resolvable mystery rows, ` +
        `${explainedByForfeit} (${((explainedByForfeit / cleanPrecisionDenominator) * 100).toFixed(1)}%) are ` +
        `explained as the flip side of a forfeit we already know about.`,
    );
    console.log(
      `${genuineMystery.length} rows remain genuinely unexplained — could be real forfeits our two existing ` +
        `methods both missed, or something else entirely.`,
    );

    if (genuineMystery.length > 0) {
      // Group by player so we can pick a diverse spot-check sample (one
      // cluster per player, not 6 rows from the same player again).
      const byPlayer = new Map<string, MongoPlayerMatchDoc[]>();
      for (const m of genuineMystery) {
        const list = byPlayer.get(m.flttPlayerId);
        if (list) list.push(m);
        else byPlayer.set(m.flttPlayerId, [m]);
      }
      console.log(
        `\n${byPlayer.size} distinct players involved in the ${genuineMystery.length} unexplained rows.`,
      );
      console.log(`\nOne row per affected player, for spot-check candidate selection:`);
      for (const [flttId, rows] of byPlayer) {
        const m = rows[0];
        console.log(
          `  ${flttId}\t${m.playerName}\t${rows.length} row(s)\t${m.isoDate}\t${resolveCompetition(m)}\t` +
            `score ${m.score}\t${flttUrlById.get(flttId) ?? ""}`,
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
