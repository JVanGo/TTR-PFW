/**
 * Second follow-up. check-performance-gap-by-competition.ts ruled out "FLTT
 * doesn't track performance for this competition type" (missing rates are
 * only 1-3% within real leagues, not systemic) and "join failure"
 * (`unmatchedPerformanceRows` is empty for the affected players).
 *
 * New hypothesis: a match is stored TWICE — once from each player's own
 * perspective (see DATASET_HANDOFF.md 5.8). A forfeit only gets flagged as a
 * forfeit on the FORFEITING player's own row (that's who Forfaits.xlsx and
 * FLTT's internal marker name). But if FLTT also skips writing a Performance
 * row for the OTHER (winning) player's mirror row of that same tie — since
 * no real match was played, there's nothing to compute a performance value
 * from for either side — then the winner's row would show up as "missing
 * Performance" too, with no forfeit label anywhere on it, inflating the
 * false-positive count without actually being wrong about anything.
 *
 * This checks that directly: for each non-tournament, non-forfeit row
 * missing a Performance entry, look up its mirror row (same tie, opposite
 * player) and see whether THAT row is a known forfeit.
 *
 * Read-only. Makes no writes anywhere.
 *
 * Usage (PowerShell):
 *   npx tsx scripts/check-performance-gap-mirror.ts
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
  won: boolean | null;
  hasPerformance: boolean;
  rencontres?: { competition?: string; round?: string; matchLabel?: string; points?: string };
}

interface MongoCatalogPlayerDoc {
  flttPlayerId: string;
  name: string;
  club: string | null;
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

    console.log("Fetching player catalog...");
    const catalog = await db
      .collection<MongoCatalogPlayerDoc>("players")
      .find({}, { projection: { _id: 0, flttPlayerId: 1, name: 1, club: 1 } })
      .toArray();
    const playerIds = catalog.map((p) => p.flttPlayerId);
    console.log(`  ${playerIds.length} players.`);

    // nameKey -> flttPlayerId candidates (best-effort single-match resolve,
    // same approach as resolveFlttId in lib/import/ttr-simulation-io.ts).
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
              won: 1,
              hasPerformance: 1,
            },
            maxTimeMS: 55_000,
          },
        )
        .toArray();
      seasonMatches.push(...docs);
    }
    console.log(`  ${seasonMatches.length} match rows.\n`);

    // Ground-truth known forfeits, same as the real pipeline.
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
    console.log(`${knownForfeitIds.size} known forfeits (existing detection, ground truth).\n`);

    // Index every row by (flttPlayerId, isoDate, competitionFamily, opponent
    // nameKey) so a row's mirror (the other player's own copy of the same
    // tie) can be looked up directly.
    const rowIndex = new Map<string, MongoPlayerMatchDoc>();
    function indexKey(flttPlayerId: string, isoDate: string, family: string, opponentNK: string) {
      return `${flttPlayerId}|${isoDate}|${family}|${opponentNK}`;
    }
    for (const m of seasonMatches) {
      const family = competitionFamily(resolveCompetition(m));
      rowIndex.set(indexKey(m.flttPlayerId, m.isoDate, family, nameKey(m.opponentName)), m);
    }

    const falsePositives = seasonMatches.filter((m) => {
      if (m.hasPerformance) return false;
      if (isTournament(resolveCompetition(m))) return false;
      return !knownForfeitIds.has(m.id);
    });
    console.log(
      `${falsePositives.length} non-tournament, non-known-forfeit rows missing Performance.\n`,
    );

    let mirrorIsKnownForfeit = 0;
    let mirrorMissingToo = 0;
    let mirrorNotFound = 0;
    let mirrorFoundNormal = 0;
    const unresolvedOpponent = { count: 0 };
    const stillUnexplainedSample: MongoPlayerMatchDoc[] = [];

    for (const fp of falsePositives) {
      const opponentFlttId = resolveFlttId(fp.opponentName);
      if (!opponentFlttId) {
        unresolvedOpponent.count++;
        continue;
      }
      const family = competitionFamily(resolveCompetition(fp));
      const mirror = rowIndex.get(
        indexKey(opponentFlttId, fp.isoDate, family, nameKey(fp.playerName)),
      );
      if (!mirror) {
        mirrorNotFound++;
        continue;
      }
      if (knownForfeitIds.has(mirror.id)) {
        mirrorIsKnownForfeit++;
      } else if (!mirror.hasPerformance) {
        mirrorMissingToo++;
        if (stillUnexplainedSample.length < 15) stillUnexplainedSample.push(fp);
      } else {
        mirrorFoundNormal++;
        if (stillUnexplainedSample.length < 15) stillUnexplainedSample.push(fp);
      }
    }

    console.log("=== Mirror-row check ===");
    console.log(
      `${mirrorIsKnownForfeit} of ${falsePositives.length} "false positives" are actually the WINNING ` +
        `side of a tie whose other half IS a known forfeit — not wrong, just unlabeled on this side.`,
    );
    console.log(
      `${mirrorMissingToo} more have a mirror row that's ALSO missing Performance (neither side labeled ` +
        `a forfeit anywhere) — could be genuine forfeits neither detection method caught, or something else.`,
    );
    console.log(
      `${mirrorFoundNormal} have a normal mirror row (opponent's row DOES have Performance) — genuinely unexplained.`,
    );
    console.log(
      `${mirrorNotFound} had no mirror row found (opponent not in our data for that date/competition).`,
    );
    console.log(
      `${unresolvedOpponent.count} had an opponent name that couldn't be resolved to one player.`,
    );

    const explainedPct = (mirrorIsKnownForfeit / Math.max(falsePositives.length, 1)) * 100;
    console.log(
      `\n${explainedPct.toFixed(1)}% of the false positives are explained by the mirror-forfeit effect.`,
    );

    if (stillUnexplainedSample.length > 0) {
      console.log(`\nSample of still-unexplained rows (mirror missing-too or normal):`);
      for (const m of stillUnexplainedSample) {
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
