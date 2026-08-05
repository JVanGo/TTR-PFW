import { MongoClient } from "mongodb";
import type { SupabaseClient } from "@supabase/supabase-js";
import { estimateTtr, isPlayerClass, type PlayerClass } from "@/lib/conversions";
import { nameKey } from "@/lib/name-key";
import { fetchAllRows } from "@/lib/supabase/fetchAll";
import { AGE_CATEGORIES, type AgeCategory } from "@/lib/import/age-categories";
import {
  simulateSeason,
  type OutputMatchRow,
  type RawSeasonMatch,
  type RawSeasonPlacement,
  type SimPlayer,
  type SimulationSummary,
} from "@/lib/import/ttr-simulation";

export const SEASON_LABEL = "2025-2026";
const MONGO_SEASON = "25-26";
const SEASON_START_ISO = "2025-07-01";
const YOUTH_GROWTH_ISO = "2026-01-01";

interface MongoPlayerMatchDoc {
  id: string;
  flttPlayerId: string;
  playerName: string;
  opponentName: string;
  isoDate: string;
  competition: string;
  score: string | null;
  won: boolean | null;
}

interface MongoTournamentPlacementDoc {
  flttPlayerId: string;
  isoDate: string;
  competition: string;
  tournamentPlacement: { place: number } | null;
}

interface MongoCatalogPlayerDoc {
  flttPlayerId: string;
  name: string;
  ranking: string;
  performanceScore: number;
}

interface PriorSeasonStats {
  count: number;
  lastIsoDate: string | null;
}

async function fetchMongoData(season: string) {
  const uri = process.env.MONGODB_URI;
  const dbName = process.env.MONGODB_DB_NAME;
  if (!uri || !dbName) throw new Error("Missing MONGODB_URI or MONGODB_DB_NAME.");

  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 15_000 });
  try {
    await client.connect();
    const db = client.db(dbName);

    const seasonMatches = await db
      .collection<MongoPlayerMatchDoc>("playerMatches")
      .find(
        { season },
        {
          projection: {
            _id: 0,
            id: 1,
            flttPlayerId: 1,
            playerName: 1,
            opponentName: 1,
            isoDate: 1,
            competition: 1,
            score: 1,
            won: 1,
          },
        },
      )
      .toArray();

    const placements = await db
      .collection<MongoTournamentPlacementDoc>("rencontresRows")
      .find(
        { season, rowType: "tournamentPlacement" },
        {
          projection: {
            _id: 0,
            flttPlayerId: 1,
            isoDate: 1,
            competition: 1,
            tournamentPlacement: 1,
          },
        },
      )
      .toArray();

    const catalog = await db
      .collection<MongoCatalogPlayerDoc>("players")
      .find(
        {},
        { projection: { _id: 0, flttPlayerId: 1, name: 1, ranking: 1, performanceScore: 1 } },
      )
      .toArray();

    const priorSeasonAgg = await db
      .collection("playerMatches")
      .aggregate<{ _id: string; count: number; lastIsoDate: string | null }>([
        { $match: { season: { $ne: season } } },
        { $group: { _id: "$flttPlayerId", count: { $sum: 1 }, lastIsoDate: { $max: "$isoDate" } } },
      ])
      .toArray();

    return { seasonMatches, placements, catalog, priorSeasonAgg };
  } finally {
    await client.close();
  }
}

interface SupabasePlayerRow {
  id: string;
  name: string;
  name_key: string;
  class: string;
  pfw: string | number;
  classement_points: string | number | null;
  age_category: string | null;
}

export interface RunSeasonSimulationResult {
  summary: SimulationSummary;
  matchRowCount: number;
}

export async function runSeasonSimulation(
  supabase: SupabaseClient,
  log: (message: string) => void = () => {},
): Promise<RunSeasonSimulationResult> {
  log("Fetching season data from MongoDB...");
  const { seasonMatches, placements, catalog, priorSeasonAgg } = await fetchMongoData(MONGO_SEASON);
  log(
    `  ${seasonMatches.length} match rows, ${placements.length} tournament placements, ${catalog.length} catalog players.`,
  );

  log("Loading players from Supabase...");
  const supabasePlayers = await fetchAllRows<SupabasePlayerRow>(
    supabase,
    "players",
    "id, name, name_key, class, pfw, classement_points, age_category",
  );
  log(`  ${supabasePlayers.length} players.`);

  // flttPlayerId -> nameKey, via the Mongo catalog (our own players table has no flttPlayerId).
  const nameKeyByFlttId = new Map<string, string>();
  for (const c of catalog) {
    nameKeyByFlttId.set(c.flttPlayerId, nameKey(c.name));
  }

  const priorStatsByNameKey = new Map<string, PriorSeasonStats>();
  for (const row of priorSeasonAgg) {
    const key = nameKeyByFlttId.get(row._id);
    if (!key) continue;
    priorStatsByNameKey.set(key, { count: row.count, lastIsoDate: row.lastIsoDate });
  }

  const isAgeCategory = (v: string | null): v is AgeCategory =>
    v != null && (AGE_CATEGORIES as readonly string[]).includes(v);

  const players: SimPlayer[] = supabasePlayers.map((p) => {
    const key = p.name_key;
    const prior = priorStatsByNameKey.get(key);
    const cls = p.class;
    const pfw = Number(p.pfw);
    const classementPoints = p.classement_points == null ? null : Number(p.classement_points);
    const startingTtr = isPlayerClass(cls)
      ? estimateTtr(pfw, cls as PlayerClass, classementPoints)
      : null;
    return {
      id: p.id,
      name: p.name,
      nameKey: key,
      startingTtr,
      ageCategory: isAgeCategory(p.age_category) ? p.age_category : null,
      careerMatchesBeforeSeason: prior?.count ?? 0,
      lastMatchIsoDateBeforeSeason: prior?.lastIsoDate ?? null,
    };
  });

  // Fallback static rating for opponents we can't resolve to a tracked player:
  // A1-B3 catalog players only — estimateTtr() needs classement_points for
  // C1-D3, which we don't have for players outside our own players table.
  const staticTtrByNameKey = new Map<string, number>();
  for (const c of catalog) {
    const cls = c.ranking?.trim().toUpperCase();
    if (!isPlayerClass(cls)) continue;
    const ttr = estimateTtr(c.performanceScore, cls as PlayerClass, null);
    if (ttr != null) staticTtrByNameKey.set(nameKey(c.name), ttr);
  }

  const matches: RawSeasonMatch[] = [];
  let skippedNoResult = 0;
  for (const m of seasonMatches) {
    if (m.won == null) {
      skippedNoResult++;
      continue;
    }
    matches.push({
      sortKey: m.id,
      isoDate: m.isoDate,
      competition: m.competition,
      playerNameKey: nameKey(m.playerName),
      opponentNameKey: nameKey(m.opponentName),
      opponentName: m.opponentName,
      score: m.score,
      won: m.won,
    });
  }

  const rawPlacements: RawSeasonPlacement[] = [];
  let skippedNoPlace = 0;
  for (const p of placements) {
    const place = p.tournamentPlacement?.place;
    if (place !== 1 && place !== 2 && place !== 3) {
      skippedNoPlace++;
      continue;
    }
    const key = nameKeyByFlttId.get(p.flttPlayerId);
    if (!key) {
      skippedNoPlace++;
      continue;
    }
    rawPlacements.push({
      sortKey: `${p.flttPlayerId}-${p.isoDate}-${p.competition}`,
      isoDate: p.isoDate,
      competition: p.competition,
      playerNameKey: key,
      place,
    });
  }

  log(
    `  ${skippedNoResult} match rows skipped (no result), ${skippedNoPlace} placement rows skipped.`,
  );
  log(`Simulating season ${SEASON_LABEL}...`);

  const { matchRows, summary } = simulateSeason({
    players,
    staticTtrByNameKey,
    matches,
    placements: rawPlacements,
    youthGrowthIsoDate: YOUTH_GROWTH_ISO,
    seasonStartIsoDate: SEASON_START_ISO,
  });

  log(
    `  graded=${summary.matchesGraded} tournamentGamesExcluded=${summary.tournamentGamesExcluded} ` +
      `placementBonuses=${summary.placementBonusesApplied} droppedNoOpponentRating=${summary.droppedNoOpponentRating} ` +
      `unresolvedPlayers=${summary.unresolvedPlayers}`,
  );

  log(`Replacing matches for season ${SEASON_LABEL}...`);
  const { error: deleteError } = await supabase.from("matches").delete().eq("season", SEASON_LABEL);
  if (deleteError) throw new Error(deleteError.message);

  const rows = matchRows.map(toMatchesTableRow);
  for (let i = 0; i < rows.length; i += 1000) {
    const chunk = rows.slice(i, i + 1000);
    const { error } = await supabase.from("matches").insert(chunk);
    if (error) throw new Error(error.message);
  }
  log(`  ${rows.length} match rows inserted.`);

  return { summary, matchRowCount: rows.length };
}

function toMatchesTableRow(row: OutputMatchRow) {
  return {
    player_id: row.playerId,
    match_date: row.matchDate,
    competition: row.competition,
    opponent_name: row.opponentName ?? "Unknown",
    opponent_player_id: row.opponentPlayerId,
    opponent_ttr: row.opponentTtr,
    score: row.score,
    result: row.result,
    ttr_delta: row.ttrDelta,
    new_ttr: row.newTtr,
    season: SEASON_LABEL,
  };
}
