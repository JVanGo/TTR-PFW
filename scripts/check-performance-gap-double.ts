/**
 * Third follow-up. Of the 2,475 non-tournament, non-known-forfeit rows
 * missing a Performance row, 1,662 have a mirror row that's ALSO missing —
 * i.e. neither side of the tie has a Performance entry, and neither side is
 * a known forfeit. Many have completely normal, competitive scores (not
 * 0-3/0-0), so they don't look like forfeits at all.
 *
 * Hypothesis: these are DOUBLES boards within a team tie. FLTT's individual
 * Performance/PFW rating is a singles rating — a doubles board naturally has
 * no individual performance calculation, so it would never get a joined
 * Performance row, with nothing forfeit-related going on.
 *
 * Checks this by inspecting `rencontres.matchLabel` (and matchLabel-derived
 * board naming) for the still-unexplained rows.
 *
 * Read-only. Makes no writes anywhere.
 *
 * Usage (PowerShell):
 *   npx tsx scripts/check-performance-gap-double.ts
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
  rencontres?: {
    competition?: string;
    round?: string;
    matchLabel?: string;
    points?: string;
  };
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

    const catalog = await db
      .collection<{ flttPlayerId: string; name: string }>("players")
      .find({}, { projection: { _id: 0, flttPlayerId: 1, name: 1 } })
      .toArray();
    const playerIds = catalog.map((p) => p.flttPlayerId);

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
    console.log(`  ${seasonMatches.length} match rows.\n`);

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
      const family = competitionFamily(resolveCompetition(m));
      rowIndex.set(indexKey(m.flttPlayerId, m.isoDate, family, nameKey(m.opponentName)), m);
    }

    const falsePositives = seasonMatches.filter((m) => {
      if (m.hasPerformance) return false;
      if (isTournament(resolveCompetition(m))) return false;
      return !knownForfeitIds.has(m.id);
    });

    // The "mirror missing too" bucket from the previous script.
    const mirrorMissingToo: MongoPlayerMatchDoc[] = [];
    for (const fp of falsePositives) {
      const opponentFlttId = resolveFlttId(fp.opponentName);
      if (!opponentFlttId) continue;
      const family = competitionFamily(resolveCompetition(fp));
      const mirror = rowIndex.get(
        indexKey(opponentFlttId, fp.isoDate, family, nameKey(fp.playerName)),
      );
      if (!mirror) continue;
      if (knownForfeitIds.has(mirror.id)) continue;
      if (!mirror.hasPerformance) mirrorMissingToo.push(fp);
    }
    console.log(`${mirrorMissingToo.length} rows in the "mirror also missing" bucket.\n`);

    // How many carry a matchLabel suggesting a doubles board?
    const doubleKeywordRe = /double|dbl|\bDB\b/i;
    let withMatchLabel = 0;
    let looksDouble = 0;
    const matchLabelSamples = new Map<string, number>();
    for (const m of mirrorMissingToo) {
      const label = m.rencontres?.matchLabel ?? "";
      if (label) withMatchLabel++;
      if (doubleKeywordRe.test(label)) looksDouble++;
      // Bucket by a normalized shape of the label (strip trailing numbers/names)
      // so we can see common label patterns without printing 1662 raw values.
      const shape = label.replace(/\d+/g, "#").trim() || "(blank)";
      matchLabelSamples.set(shape, (matchLabelSamples.get(shape) ?? 0) + 1);
    }
    console.log(
      `${withMatchLabel} / ${mirrorMissingToo.length} have a non-blank rencontres.matchLabel.`,
    );
    console.log(
      `${looksDouble} / ${mirrorMissingToo.length} matchLabel contains a "double"-ish keyword.\n`,
    );

    console.log("Most common matchLabel shapes in this bucket:");
    const rankedShapes = [...matchLabelSamples.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15);
    for (const [shape, count] of rankedShapes) {
      console.log(`  ${String(count).padStart(5)}  ${shape}`);
    }

    console.log("\nRaw matchLabel sample (first 20 rows):");
    for (const m of mirrorMissingToo.slice(0, 20)) {
      console.log(
        `  [${m.rencontres?.matchLabel ?? ""}] ${m.playerName} vs ${m.opponentName} — score ${m.score} — ${resolveCompetition(m)}`,
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
