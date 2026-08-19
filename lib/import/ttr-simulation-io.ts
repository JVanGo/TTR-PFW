import { MongoClient, type Db } from "mongodb";
import type { SupabaseClient } from "@supabase/supabase-js";
import { estimateTtr, isPlayerClass, type PlayerClass } from "@/lib/conversions";
import { nameKey } from "@/lib/name-key";
import { fetchAllRows } from "@/lib/supabase/fetchAll";
import {
  excludeKnownFalsePositives,
  findMarkerOnlyForfeits,
  findPerformanceGapForfeits,
  FORFEIT_EXCLUSIONS,
  matchForfeits,
  readForfeitsFile,
  type MatchCandidateRow,
  type PerformanceGapRow,
} from "@/lib/import/forfeits";
import { FORFEIT_OVERRIDES } from "@/lib/import/forfeit-overrides";
import { PERFORMANCE_GAP_CONFIRMED_FORFEITS } from "@/lib/import/performance-gap-confirmed-forfeits";
import { fetchLatestTtrByPlayer } from "@/lib/supabase/latestTtr";
import { AGE_CATEGORIES, type AgeCategory } from "@/lib/import/age-categories";
import { fetchSeasonStartTtr, type SeasonStartTtr } from "@/lib/import/season-start-snapshot";
import {
  readSeasonStartExportFile,
  SEASON_START_EXPORT_PATH,
} from "@/lib/import/season-start-export";
import { SEASON_START_OVERRIDES } from "@/lib/import/season-start-overrides";
import {
  simulateSeason,
  CAREER_MATCH_THRESHOLD,
  ersteinstufungFor,
  inactivityDeductionAppliedAsOf,
  type OutputMatchRow,
  type RawSeasonMatch,
  type RawSeasonPlacement,
  type SimPlayer,
  type SimulationSummary,
} from "@/lib/import/ttr-simulation";

// Safe fallback when the career-match history query is unavailable: at or
// above the "newcomer" threshold, so no bonus is wrongly applied.
const CAREER_MATCH_SAFE_DEFAULT = CAREER_MATCH_THRESHOLD;

export const SEASON_LABEL = "2025-2026";
const MONGO_SEASON = "25-26";
const SEASON_START_ISO = "2025-07-01";
// Each Teilrunde's [start, end) window, in order: Aug 1 2025 - Jan 1 2026
// ("Hironn"), then Jan 1 2026 - Aug 1 2026. A youth-bracket player only earns
// a given period's bonus (landing on that period's `end` date) if they
// played a graded match within that specific window.
const YOUTH_GROWTH_PERIODS = [
  { start: "2025-08-01", end: "2026-01-01" },
  { start: "2026-01-01", end: "2026-08-01" },
];

interface SeasonStartExportSnapshot {
  class: PlayerClass;
  pfw: number;
  classementPoints: number | null;
}

// Falls back to the match-history heuristic (fetchSeasonStartTtr) for
// everyone when the export file isn't present — see season-start-export.ts.
function loadSeasonStartExport(
  log: (message: string) => void,
): Map<string, SeasonStartExportSnapshot> {
  const entries = readSeasonStartExportFile();
  const result = new Map<string, SeasonStartExportSnapshot>();
  for (const e of entries) {
    result.set(e.flttPlayerId, {
      class: e.class,
      pfw: e.pfw,
      classementPoints: e.classementPoints,
    });
  }
  log(
    entries.length > 0
      ? `  Loaded ${result.size} season-start snapshots from ${SEASON_START_EXPORT_PATH}.`
      : `  No season-start export found at ${SEASON_START_EXPORT_PATH} — using match-history snapshots only.`,
  );
  return result;
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
  // Whether FLTT's Performance table has a row joined to this Rencontres
  // match — see findPerformanceGapForfeits in lib/import/forfeits.ts for why
  // this is a third (review-only, never auto-applied) forfeit signal.
  hasPerformance: boolean;
  // The top-level `competition` is sourced from the Performance-table row and
  // is blank whenever that source cell was blank (including for most TOU
  // tournament games) — `rencontres.competition` comes from the Rencontres
  // table instead and is reliably populated. Prefer it as a fallback so a
  // blanked-out competition doesn't (a) break match-pair dedup between two
  // tracked players' mirrored rows, or (b) let a TOU game slip past the
  // tournament-exclusion filter.
  // `round`/`matchLabel` are used to match this row against Forfaits.xlsx
  // entries (see resolveCompetition/matchForfeits below); `points` is a raw
  // source cell that's usually blank but sometimes carries a JSON blob with
  // FLTT's own private "forfeit":true marker — see hasForfeitMarker below.
  // Otherwise unused by the rest of the pipeline.
  rencontres?: { competition?: string; round?: string; matchLabel?: string; points?: string };
  // Opponent's club at match time, when a Performance-table row was joined —
  // used to disambiguate two different players who share a name (see
  // playersByNameKey below). Not present on every row.
  performance?: { opponentClub?: string | null } | null;
}

/** The top-level `competition` is sourced from the Performance-table row and
 * is blank whenever that source cell was blank (including for most TOU
 * tournament games) — `rencontres.competition` comes from the Rencontres
 * table instead and is reliably populated. Prefer it as a fallback so a
 * blanked-out competition doesn't (a) break match-pair dedup between two
 * tracked players' mirrored rows, (b) let a TOU game slip past the
 * tournament-exclusion filter, or (c) fail to match a Forfaits.xlsx entry's
 * half-season "(Rx)" marker. */
function resolveCompetition(m: Pick<MongoPlayerMatchDoc, "competition" | "rencontres">): string {
  return m.competition?.trim() || m.rencontres?.competition?.trim() || "";
}

/** `rencontres.points` is normally blank, but on some rows carries a raw JSON
 * blob straight from FLTT's own source with its own "forfeit":true/false
 * flag — see findMarkerOnlyForfeits in lib/import/forfeits.ts for why this is
 * treated as a secondary detection source, not the primary one. */
function hasForfeitMarker(m: Pick<MongoPlayerMatchDoc, "rencontres">): boolean {
  return (m.rencontres?.points ?? "").includes('"forfeit":true');
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
  club: string | null;
  ranking: string;
  performanceScore: number;
}

/** Normalizes a club name for comparison; null/blank all compare equal. */
function clubKey(club: string | null): string {
  return (club ?? "").trim().toLowerCase();
}

/** A player's identity for this run: name plus club, so two different real
 * people who happen to share a name (confirmed: ~25 cases in the FLTT
 * catalog) don't get their match histories merged together. */
function identityKey(playerNameKey: string, club: string | null): string {
  return `${playerNameKey}|${clubKey(club)}`;
}

interface PriorSeasonStats {
  count: number;
  lastIsoDate: string | null;
}

/** "25-26" with n=2 -> ["24-25", "23-24"] — the n seasons immediately before `current`. */
export function previousNSeasons(current: string, n: number): string[] {
  const start = Number(current.split("-")[0]);
  const pad = (v: number) => String(((v % 100) + 100) % 100).padStart(2, "0");
  return Array.from({ length: n }, (_, i) => `${pad(start - i - 1)}-${pad(start - i)}`);
}

// How many seasons back fetchPriorSeasonStats looks for an exact last-match
// date — comfortably covers the Inaktivitätsabzug 36-month cap (see
// staleLastMatchSentinelIso below for players whose last match predates even
// this window).
const LAST_ACTIVE_DATE_SEASON_LOOKBACK = 4;

/**
 * A conservative "last active" date for a player with real career matches
 * (count > 0) whose last one falls outside LAST_ACTIVE_DATE_SEASON_LOOKBACK
 * seasons — guarantees they land past the Inaktivitätsabzug 36-month cap
 * without claiming a false-precision exact date.
 */
export function staleLastMatchSentinelIso(seasonStartIso: string): string {
  const year = Number(seasonStartIso.slice(0, 4));
  return `${year - LAST_ACTIVE_DATE_SEASON_LOOKBACK}${seasonStartIso.slice(4)}`;
}

/** Numeric start year for a "YY-YY" season string, e.g. "25-26" -> 25. */
export function seasonStartYear(season: string): number {
  return Number(season.split("-")[0]);
}

/** "2026-2027" -> "2025-2026" — the SEASON_LABEL immediately before `current`. */
export function previousSeasonLabel(current: string): string {
  const [startYear, endYear] = current.split("-").map(Number);
  return `${startYear - 1}-${endYear - 1}`;
}

/**
 * Career match-count and recent last-active-date per player — feeds the
 * newcomer/inactivity K-factor bonuses. The two pieces deliberately come
 * from different collections:
 *
 * - Count: `playerHistorySeasons`, one pre-counted row per player per
 *   season, summed across every season before the current one.
 *   `playerMatches` (one row per match) has no index leading with `season`
 *   alone, and even batched by player ID, pulling a player's ENTIRE match
 *   history this way routinely pulls tens of thousands of documents per
 *   100-player batch and reliably exceeds Cosmos DB's server-side command
 *   timeout — confirmed 2026-08-19 investigating a veteran player (320
 *   career matches across 15 seasons) wrongly getting the newcomer bonus
 *   because the count used to only look back 2 seasons, same as the date
 *   below. `playerHistorySeasons` is orders of magnitude smaller (one row
 *   per player-season instead of per match) and comfortably fast for the
 *   whole catalog, every season, with the same player-ID batching.
 * - Last-active date: `playerMatches`, scoped to the
 *   LAST_ACTIVE_DATE_SEASON_LOOKBACK (4) seasons immediately before the
 *   current one — comfortably covers the Inaktivitätsabzug rule's 36-month
 *   cap with an exact date for anyone who played within that window.
 *   `playerHistorySeasons` has no per-match date to give a precise one
 *   anyway. For a player with real career matches whose last one still
 *   falls outside even this widened window, `staleLastMatchSentinelIso`
 *   supplies a conservative placeholder date rather than a real one — see
 *   its own comment.
 *
 * Treated as best-effort: on failure, log and continue without it rather
 * than failing the whole run. Critically, the fallback must NOT default
 * every player to "new and inactive" (that's the opposite of conservative —
 * most players are neither) — the caller applies a "assume experienced and
 * active" default instead when this times out.
 */
async function fetchPriorSeasonStats(
  db: Db,
  currentSeason: string,
  playerIds: string[],
): Promise<{
  rows: { _id: string; count: number; lastIsoDate: string | null }[];
  timedOut: boolean;
}> {
  try {
    const currentStartYear = seasonStartYear(currentSeason);
    const countDocs = await fetchInPlayerBatches(playerIds, (idBatch) =>
      db
        .collection<{ flttPlayerId: string; season: string; counts?: { matches?: number } }>(
          "playerHistorySeasons",
        )
        .find(
          { flttPlayerId: { $in: idBatch } },
          {
            projection: { _id: 0, flttPlayerId: 1, season: 1, "counts.matches": 1 },
            maxTimeMS: 55_000,
          },
        )
        .toArray(),
    );
    const countByPlayer = new Map<string, number>();
    for (const d of countDocs) {
      if (seasonStartYear(d.season) >= currentStartYear) continue; // this season or a future one
      countByPlayer.set(
        d.flttPlayerId,
        (countByPlayer.get(d.flttPlayerId) ?? 0) + (d.counts?.matches ?? 0),
      );
    }

    const seasons = previousNSeasons(currentSeason, LAST_ACTIVE_DATE_SEASON_LOOKBACK);
    const dateDocs = await fetchInPlayerBatches(playerIds, (idBatch) =>
      db
        .collection<{ flttPlayerId: string; isoDate: string }>("playerMatches")
        .find(
          { flttPlayerId: { $in: idBatch }, season: { $in: seasons } },
          { projection: { _id: 0, flttPlayerId: 1, isoDate: 1 }, maxTimeMS: 55_000 },
        )
        .toArray(),
    );
    const lastIsoDateByPlayer = new Map<string, string>();
    for (const d of dateDocs) {
      const existing = lastIsoDateByPlayer.get(d.flttPlayerId);
      if (!existing || d.isoDate > existing) lastIsoDateByPlayer.set(d.flttPlayerId, d.isoDate);
    }

    const sentinelIso = staleLastMatchSentinelIso(SEASON_START_ISO);
    const ids = new Set([...countByPlayer.keys(), ...lastIsoDateByPlayer.keys()]);
    const rows = Array.from(ids, (_id) => {
      const count = countByPlayer.get(_id) ?? 0;
      const recentDate = lastIsoDateByPlayer.get(_id) ?? null;
      return { _id, count, lastIsoDate: recentDate ?? (count > 0 ? sentinelIso : null) };
    });
    return { rows, timedOut: false };
  } catch (err) {
    console.warn(
      `  Career-match/inactivity stats query failed, continuing without it: ${(err as Error).message}`,
    );
    return { rows: [], timedOut: true };
  }
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

// playerMatches/rencontresRows are only indexed leading with flttPlayerId
// (see DATASET_HANDOFF.md section 9), so a query scoped to `season` alone is
// a full-collection scan that reliably exceeds Cosmos DB's server-side
// command timeout on this ~1M-row collection. Splitting the same query into
// one $in-batch of player IDs at a time lets each batch use the
// (flttPlayerId, season, ...) index instead, and keeps every individual
// request small enough to finish well inside the timeout. Sequential (not
// parallel) on purpose: Cosmos's own timeout error blames "concurrent
// transactions", so firing batches at once would work against the fix.
const PLAYER_BATCH_SIZE = 100;

async function fetchInPlayerBatches<T>(
  playerIds: string[],
  runBatch: (idBatch: string[]) => Promise<T[]>,
): Promise<T[]> {
  const results: T[] = [];
  for (const idBatch of chunk(playerIds, PLAYER_BATCH_SIZE)) {
    results.push(...(await runBatch(idBatch)));
  }
  return results;
}

async function fetchMongoData(season: string) {
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
        {},
        {
          projection: {
            _id: 0,
            flttPlayerId: 1,
            name: 1,
            club: 1,
            ranking: 1,
            performanceScore: 1,
          },
        },
      )
      .toArray();
    const playerIds = catalog.map((p) => p.flttPlayerId);

    const seasonMatches = await fetchInPlayerBatches(playerIds, (idBatch) =>
      db
        .collection<MongoPlayerMatchDoc>("playerMatches")
        .find(
          { flttPlayerId: { $in: idBatch }, season },
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
              "performance.opponentClub": 1,
              score: 1,
              won: 1,
              hasPerformance: 1,
            },
            maxTimeMS: 55_000,
          },
        )
        .toArray(),
    );

    const placements = await fetchInPlayerBatches(playerIds, (idBatch) =>
      db
        .collection<MongoTournamentPlacementDoc>("rencontresRows")
        .find(
          { flttPlayerId: { $in: idBatch }, season, rowType: "tournamentPlacement" },
          {
            projection: {
              _id: 0,
              flttPlayerId: 1,
              isoDate: 1,
              competition: 1,
              tournamentPlacement: 1,
            },
            maxTimeMS: 55_000,
          },
        )
        .toArray(),
    );

    const priorSeasonStats = await fetchPriorSeasonStats(db, season, playerIds);
    const seasonStartByFlttId = await fetchSeasonStartTtr(db, season, playerIds);

    return {
      seasonMatches,
      placements,
      catalog,
      priorSeasonAgg: priorSeasonStats.rows,
      priorSeasonStatsTimedOut: priorSeasonStats.timedOut,
      seasonStartByFlttId,
    };
  } finally {
    await client.close();
  }
}

interface SupabasePlayerRow {
  id: string;
  name: string;
  name_key: string;
  club: string | null;
  class: string;
  pfw: string | number;
  classement_points: string | number | null;
  age_category: string | null;
  is_active: boolean;
}

/**
 * Resolve a name to exactly one of our players, disambiguating by club when
 * more than one of our players shares that name. With zero or one candidate,
 * club isn't required (so e.g. a club transfer still matches); with more
 * than one, an unknown or non-matching club means we can't safely resolve —
 * callers should treat that as "not found" rather than guess.
 */
function resolvePlayer(
  playersByNameKey: Map<string, SupabasePlayerRow[]>,
  candidateNameKey: string,
  knownClub: string | null,
): SupabasePlayerRow | null {
  const candidates = playersByNameKey.get(candidateNameKey) ?? [];
  if (candidates.length <= 1) return candidates[0] ?? null;
  if (knownClub == null) return null;
  return candidates.find((c) => clubKey(c.club) === clubKey(knownClub)) ?? null;
}

export interface RunSeasonSimulationResult {
  summary: SimulationSummary;
  matchRowCount: number;
}

export interface SeasonSimulationResult {
  matchRows: OutputMatchRow[];
  summary: SimulationSummary;
  playerLastMatchDates: { playerId: string; lastMatchIsoDate: string | null }[];
}

/**
 * Fetches Mongo/Supabase inputs and runs the season simulation — everything
 * `runSeasonSimulation` does except the destructive delete+insert into
 * `matches`. Split out so an audit script can recompute the season and diff
 * it against what's actually stored in prod without writing anything.
 */
export async function computeSeasonSimulation(
  supabase: SupabaseClient,
  log: (message: string) => void = () => {},
): Promise<SeasonSimulationResult> {
  log("Fetching season data from MongoDB...");
  const {
    seasonMatches,
    placements,
    catalog,
    priorSeasonAgg,
    priorSeasonStatsTimedOut,
    seasonStartByFlttId,
  } = await fetchMongoData(MONGO_SEASON);
  log(
    `  ${seasonMatches.length} match rows, ${placements.length} tournament placements, ${catalog.length} catalog players.`,
  );
  if (priorSeasonStatsTimedOut) {
    log(
      "  Career-match/inactivity stats query timed out on the Mongo side — continuing without " +
        "them. Every player defaults to 'experienced and active' (no newcomer/inactivity K-bonus) " +
        "rather than the reverse, since that's true for the vast majority of players.",
    );
  }

  const forfeitEntries = readForfeitsFile();
  const forfeitCandidateRows: MatchCandidateRow[] = seasonMatches.map((m) => ({
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
  const { forfeitedRowIds: xlsxForfeitedRowIds, reviewLines } = matchForfeits(
    forfeitCandidateRows,
    forfeitEntries,
    FORFEIT_OVERRIDES,
  );
  for (const line of reviewLines) log(`  [forfeit review] ${line}`);
  log(
    `  ${xlsxForfeitedRowIds.size} forfeited rows detected from ${forfeitEntries.length} ` +
      `Forfaits.xlsx entries (${reviewLines.length} flagged for manual review).`,
  );

  const { forfeitedRowIds: markerOnlyRowIds, noteLines } = findMarkerOnlyForfeits(
    forfeitCandidateRows,
    xlsxForfeitedRowIds,
  );
  for (const line of noteLines) log(`  [forfeit note] ${line}`);
  if (markerOnlyRowIds.size > 0) {
    log(
      `  ${markerOnlyRowIds.size} more forfeited rows found via FLTT's own internal marker, not ` +
        `present in Forfaits.xlsx at all.`,
    );
  }
  const knownForfeitedRowIds = excludeKnownFalsePositives(
    forfeitCandidateRows,
    new Set([...xlsxForfeitedRowIds, ...markerOnlyRowIds]),
    FORFEIT_EXCLUSIONS,
  );

  // Third signal. Two outcomes: rows matched against
  // PERFORMANCE_GAP_CONFIRMED_FORFEITS (Jeff's own manual review — see that
  // file's doc comment) ARE folded into forfeitedRowIds below, same as the
  // other two sources. Everything else is still review-only, with zero
  // effect on ratings — surfaced as candidates for Jeff to check against
  // fltt.lu by hand; see findPerformanceGapForfeits' doc comment for why an
  // unreviewed candidate isn't reliable enough to auto-apply.
  const performanceGapRows: PerformanceGapRow[] = forfeitCandidateRows.map((r, i) => ({
    ...r,
    playerName: seasonMatches[i].playerName,
    hasPerformance: seasonMatches[i].hasPerformance,
  }));
  const { confirmedForfeitRowIds, reviewLines: performanceGapReviewLines } =
    findPerformanceGapForfeits(
      performanceGapRows,
      knownForfeitedRowIds,
      new Date().toISOString().slice(0, 10),
      PERFORMANCE_GAP_CONFIRMED_FORFEITS,
    );
  if (confirmedForfeitRowIds.size > 0) {
    log(
      `  ${confirmedForfeitRowIds.size} more forfeited rows applied from Jeff's manual ` +
        `performance-gap review (PERFORMANCE_GAP_CONFIRMED_FORFEITS).`,
    );
  }
  for (const line of performanceGapReviewLines) log(`  [performance-gap review] ${line}`);
  if (performanceGapReviewLines.length > 0) {
    log(
      `  ${performanceGapReviewLines.length} more candidates found via the Performance-table gap — ` +
        `NOT applied as forfeits, needs a manual fltt.lu check first.`,
    );
  }
  const forfeitedRowIds = new Set([...knownForfeitedRowIds, ...confirmedForfeitRowIds]);

  log("Loading players from Supabase...");
  const supabasePlayers = await fetchAllRows<SupabasePlayerRow>(
    supabase,
    "players",
    "id, name, name_key, club, class, pfw, classement_points, age_category, is_active",
  );
  log(`  ${supabasePlayers.length} players.`);

  // A returning player's own final rating from the season we just simulated
  // is a far better season-start estimate than re-deriving one from FLTT's
  // classement/PFW export (which is what every source below this exists to
  // approximate in the first place). Keyed by our own player_id, not
  // name/club — it's the same Supabase `players` row across seasons, so none
  // of the same-name disambiguation used elsewhere in this file is needed
  // here. No-op for a season with no prior SEASON_LABEL data yet (e.g. today,
  // there's no "2024-2025" row to find).
  const priorSeasonDtrByPlayerId = await fetchLatestTtrByPlayer(
    supabase,
    previousSeasonLabel(SEASON_LABEL),
  );
  log(`  ${priorSeasonDtrByPlayerId.size} players carrying forward a prior-season DTR.`);

  // "Typical player in this class" stand-in for the SEASON_START_OVERRIDES
  // players, none of whom have a usable starting PFW — the median PFW-
  // regression estimate among today's active players in the same class.
  const ttrByClassForMedian = new Map<PlayerClass, number[]>();
  for (const p of supabasePlayers) {
    if (!p.is_active || !isPlayerClass(p.class)) continue;
    const ttr = estimateTtr(
      Number(p.pfw),
      p.class,
      p.classement_points == null ? null : Number(p.classement_points),
    );
    if (ttr == null) continue;
    const list = ttrByClassForMedian.get(p.class);
    if (list) list.push(ttr);
    else ttrByClassForMedian.set(p.class, [ttr]);
  }
  const medianTtrByClass = new Map<PlayerClass, number>();
  for (const [cls, ttrs] of ttrByClassForMedian) {
    const sorted = [...ttrs].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    const median = sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
    medianTtrByClass.set(cls, Math.round(median));
  }
  const overrideClassByFlttId = new Map(
    SEASON_START_OVERRIDES.map((o) => [o.flttPlayerId, o.class]),
  );

  const playersByNameKey = new Map<string, SupabasePlayerRow[]>();
  for (const p of supabasePlayers) {
    const list = playersByNameKey.get(p.name_key);
    if (list) list.push(p);
    else playersByNameKey.set(p.name_key, [p]);
  }

  // flttPlayerId -> {nameKey, club}, via the Mongo catalog (our own players
  // table has no flttPlayerId) — the club is what lets us tell apart two
  // different real players who happen to share a name.
  const catalogByFlttId = new Map<string, { nameKey: string; club: string | null }>();
  // The reverse: nameKey -> catalog candidates, so a Supabase player row can
  // be resolved back to its flttPlayerId (to look up its season-start TTR).
  const catalogByNameKey = new Map<string, { flttPlayerId: string; club: string | null }[]>();
  for (const c of catalog) {
    catalogByFlttId.set(c.flttPlayerId, { nameKey: nameKey(c.name), club: c.club });
    const key = nameKey(c.name);
    const list = catalogByNameKey.get(key);
    const entry = { flttPlayerId: c.flttPlayerId, club: c.club };
    if (list) list.push(entry);
    else catalogByNameKey.set(key, [entry]);
  }
  function resolveFlttId(candidateNameKey: string, knownClub: string | null): string | null {
    const candidates = catalogByNameKey.get(candidateNameKey) ?? [];
    if (candidates.length <= 1) return candidates[0]?.flttPlayerId ?? null;
    return candidates.find((c) => clubKey(c.club) === clubKey(knownClub))?.flttPlayerId ?? null;
  }

  // Keyed by identityKey (name + club), not name alone — two different real
  // players can share a name (see identityKey's own comment), and a plain
  // name_key lookup here would let one's career-match history silently
  // overwrite the other's, wrongly swaying the newcomer/inactivity K-bonus.
  const priorStatsByNameKey = new Map<string, PriorSeasonStats>();
  for (const row of priorSeasonAgg) {
    const info = catalogByFlttId.get(row._id);
    if (!info) continue;
    priorStatsByNameKey.set(identityKey(info.nameKey, info.club), {
      count: row.count,
      lastIsoDate: row.lastIsoDate,
    });
  }

  const isAgeCategory = (v: string | null): v is AgeCategory =>
    v != null && (AGE_CATEGORIES as readonly string[]).includes(v);

  const seasonStartExportByFlttId = loadSeasonStartExport(log);

  let priorSeasonHits = 0;
  let overrideHits = 0;
  let youthErsteinstufungHits = 0;
  let exportHits = 0;
  let seasonStartHits = 0;
  const players: SimPlayer[] = supabasePlayers.map((p) => {
    const prior = priorStatsByNameKey.get(identityKey(p.name_key, p.club));
    const cls = p.class;
    const pfw = Number(p.pfw);
    const classementPoints = p.classement_points == null ? null : Number(p.classement_points);
    const ageCategory = isAgeCategory(p.age_category) ? p.age_category : null;

    // Prefer the player's class/PFW/classement points as of the start of the
    // season over Supabase's `players` row, which only ever reflects the
    // latest catalog import — i.e. roughly where they ended up, not where
    // they started. Best source first: their own final DTR from the season
    // immediately prior (nothing to re-derive — they already have a real
    // computed rating), then a manual correction (SEASON_START_OVERRIDES) for
    // a player whose export row had to be discarded, then FLTT's own
    // season-start export when Jeff has one on hand, then a snapshot inferred
    // from their earliest match this season (see season-start-snapshot.ts for
    // why either beats today's catalog).
    const flttId = resolveFlttId(p.name_key, p.club);
    const overrideClass = flttId ? overrideClassByFlttId.get(flttId) : undefined;
    const exportSnapshot = flttId ? seasonStartExportByFlttId.get(flttId) : undefined;
    const seasonStart: SeasonStartTtr | undefined = flttId
      ? seasonStartByFlttId.get(flttId)
      : undefined;

    // Each source only "claims" the player if it actually produces a number —
    // a classement-class export/season-start row with no points recorded
    // yields null from estimateTtr(), and previously that null was taken as
    // final instead of falling through to the next source. That silently
    // dropped an established player (e.g. current B2, started the season as
    // C1) straight to the flat newcomer/age default, skipping every real
    // fallback meant to catch exactly this case.
    let startingTtr: number | null = null;
    const priorSeasonDtr = priorSeasonDtrByPlayerId.get(p.id);
    if (priorSeasonDtr != null) {
      priorSeasonHits++;
      startingTtr = priorSeasonDtr;
    }
    if (startingTtr == null && overrideClass) {
      const est = medianTtrByClass.get(overrideClass) ?? null;
      if (est != null) {
        overrideHits++;
        startingTtr = est;
      }
    }
    // A D3 youth player's own classement points are essentially a
    // placeholder (D3 is the bottom rung everyone starts in, so 0 or
    // near-0 points is the norm, not a real performance signal) — every
    // remaining source below (FLTT's export, the earliest-match heuristic,
    // and the final catalog fallback) estimates a rating from those same
    // classement points via estimateTtr(), which is calibrated for adult
    // league players and lands well above the PDF's own age-based
    // Ersteinstufung for a beginner (e.g. ~936 for a Poussin, vs. the
    // PDF's 850). D3 is exactly the "no real track record yet" case the
    // Ersteinstufung values are meant for, so this runs before any of
    // those classement-based sources get a chance to claim the player.
    // Non-D3 classes are left alone — being promoted past D3 is itself
    // real, age-independent evidence, and a real prior-season DTR or a
    // manual SEASON_START_OVERRIDES correction (both checked above) still
    // wins over the flat default, same as for adults.
    if (startingTtr == null && ageCategory != null && cls === "D3") {
      youthErsteinstufungHits++;
      startingTtr = ersteinstufungFor(ageCategory);
    }
    if (startingTtr == null && exportSnapshot) {
      const est = estimateTtr(
        exportSnapshot.pfw,
        exportSnapshot.class,
        exportSnapshot.classementPoints,
      );
      if (est != null) {
        exportHits++;
        startingTtr = est;
      }
    }
    if (startingTtr == null && seasonStart) {
      seasonStartHits++;
      startingTtr = seasonStart.ttr;
    }
    if (startingTtr == null) {
      startingTtr = isPlayerClass(cls)
        ? estimateTtr(pfw, cls as PlayerClass, classementPoints)
        : null;
    }
    // Still nothing, and not a true beginner (D3): FLTT already placed this
    // player above D3 through real results, just without a points value on
    // file — use that class's own zero-point anchor instead of falling
    // through to simulateSeason()'s age-based newcomer default below, which
    // is only appropriate for D3 (no track record at all).
    if (startingTtr == null && isPlayerClass(cls) && cls !== "D3") {
      startingTtr = estimateTtr(pfw, cls as PlayerClass, 0);
    }
    // A timed-out query means "no data available", not "confirmed zero
    // matches" — defaulting to 0/null here would wrongly flag every player
    // as a brand-new, long-inactive newcomer. Assume the opposite
    // (experienced, active) instead when we genuinely have no information.
    const lastMatchIsoDateBeforeSeason = priorSeasonStatsTimedOut
      ? SEASON_START_ISO
      : (prior?.lastIsoDate ?? null);
    return {
      id: p.id,
      name: p.name,
      nameKey: identityKey(p.name_key, p.club),
      startingTtr,
      ageCategory,
      careerMatchesBeforeSeason: priorSeasonStatsTimedOut
        ? CAREER_MATCH_SAFE_DEFAULT
        : (prior?.count ?? 0),
      lastMatchIsoDateBeforeSeason,
      // Only nonzero when startingTtr was carried forward from the player's
      // own prior-season final DTR — that's the only case a deduction could
      // already be silently baked into the starting number. Every other
      // source seeds 0, so the checkpoints apply the real deduction
      // visibly, in full, the first time this feature evaluates them.
      inactivityDeductionAlreadyApplied:
        priorSeasonDtr != null
          ? inactivityDeductionAppliedAsOf(lastMatchIsoDateBeforeSeason, SEASON_START_ISO)
          : 0,
    };
  });
  log(
    `  ${priorSeasonHits} of ${players.length} players carried forward their prior-season DTR; ` +
      `${overrideHits} more used a manual season-start correction; ${youthErsteinstufungHits} more ` +
      `used their age-based Ersteinstufung (D3 youth); ${exportHits} more from FLTT's own export; ` +
      `${seasonStartHits} more from their earliest match this season; the rest fall back to today's ` +
      `catalog class/PFW.`,
  );

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
  let skippedSelfUnresolved = 0;
  let ambiguousOpponent = 0;
  for (const m of seasonMatches) {
    if (m.won == null) {
      skippedNoResult++;
      continue;
    }

    // The row's own player: always resolvable via their catalog club (exact,
    // no guessing) — if they're not one of our tracked players at all, skip
    // this row entirely (there's no valid player_id to attach it to).
    const selfInfo = catalogByFlttId.get(m.flttPlayerId);
    const selfPlayer = resolvePlayer(
      playersByNameKey,
      selfInfo?.nameKey ?? nameKey(m.playerName),
      selfInfo?.club ?? null,
    );
    if (!selfPlayer) {
      skippedSelfUnresolved++;
      continue;
    }

    // The opponent: only a name (plus, sometimes, a club from a joined
    // Performance row). Most names have exactly one of our players and
    // resolve unambiguously; a shared name without a matching club can't be
    // safely resolved, so it's treated as untracked (counted separately).
    const opponentCandidateKey = nameKey(m.opponentName);
    const opponentCandidates = playersByNameKey.get(opponentCandidateKey) ?? [];
    const opponentPlayer = resolvePlayer(
      playersByNameKey,
      opponentCandidateKey,
      m.performance?.opponentClub ?? null,
    );
    if (!opponentPlayer && opponentCandidates.length > 1) ambiguousOpponent++;

    matches.push({
      sortKey: m.id,
      isoDate: m.isoDate,
      competition: resolveCompetition(m),
      playerNameKey: identityKey(selfPlayer.name_key, selfPlayer.club),
      opponentNameKey: opponentPlayer
        ? identityKey(opponentPlayer.name_key, opponentPlayer.club)
        : opponentCandidateKey,
      opponentName: m.opponentName,
      score: m.score,
      won: m.won,
      isForfeit: forfeitedRowIds.has(m.id),
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
    const selfInfo = catalogByFlttId.get(p.flttPlayerId);
    const selfPlayer = selfInfo
      ? resolvePlayer(playersByNameKey, selfInfo.nameKey, selfInfo.club)
      : null;
    if (!selfPlayer) {
      skippedNoPlace++;
      continue;
    }
    rawPlacements.push({
      sortKey: `${p.flttPlayerId}-${p.isoDate}-${p.competition}`,
      isoDate: p.isoDate,
      competition: p.competition,
      playerNameKey: identityKey(selfPlayer.name_key, selfPlayer.club),
      place,
    });
  }

  log(
    `  ${skippedNoResult} match rows skipped (no result), ${skippedSelfUnresolved} skipped ` +
      `(player not found), ${ambiguousOpponent} opponents left unresolved (shared name, no club ` +
      `match), ${skippedNoPlace} placement rows skipped.`,
  );
  log(`Simulating season ${SEASON_LABEL}...`);

  const { matchRows, summary, playerLastMatchDates } = simulateSeason({
    players,
    staticTtrByNameKey,
    matches,
    placements: rawPlacements,
    youthGrowthPeriods: YOUTH_GROWTH_PERIODS,
    seasonStartIsoDate: SEASON_START_ISO,
  });

  log(
    `  graded=${summary.matchesGraded} forfeitsApplied=${summary.forfeitsApplied} ` +
      `tournamentGamesExcluded=${summary.tournamentGamesExcluded} ` +
      `nonRatedGamesExcluded=${summary.nonRatedGamesExcluded} placementBonuses=${summary.placementBonusesApplied} ` +
      `youthGrowthBonuses=${summary.youthGrowthBonusesApplied} ` +
      `inactivityDeductionsApplied=${summary.inactivityDeductionsApplied} ` +
      `droppedNoOpponentRating=${summary.droppedNoOpponentRating} unresolvedPlayers=${summary.unresolvedPlayers}`,
  );

  return { matchRows, summary, playerLastMatchDates };
}

/**
 * Batch-updates players.last_match_date from a fresh simulation run — feeds
 * the match-based "inactive" badge (see isMatchInactive in
 * lib/import/ttr-simulation.ts). Chunked, same pattern as other bulk
 * players-table updates in this codebase.
 */
async function applyLastMatchDatesToSupabase(
  supabase: SupabaseClient,
  playerLastMatchDates: { playerId: string; lastMatchIsoDate: string | null }[],
  log: (message: string) => void,
): Promise<void> {
  for (let i = 0; i < playerLastMatchDates.length; i += 200) {
    const chunk = playerLastMatchDates.slice(i, i + 200);
    const results = await Promise.all(
      chunk.map(({ playerId, lastMatchIsoDate }) =>
        supabase.from("players").update({ last_match_date: lastMatchIsoDate }).eq("id", playerId),
      ),
    );
    const failed = results.find((r) => r.error);
    if (failed?.error) throw new Error(failed.error.message);
  }
  log(`  ${playerLastMatchDates.length} players' last_match_date updated.`);
}

export async function runSeasonSimulation(
  supabase: SupabaseClient,
  log: (message: string) => void = () => {},
): Promise<RunSeasonSimulationResult> {
  const { matchRows, summary, playerLastMatchDates } = await computeSeasonSimulation(supabase, log);

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

  await applyLastMatchDatesToSupabase(supabase, playerLastMatchDates, log);

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
    k_factor: row.kFactor,
    k_age_bonus: row.kAgeBonus,
    k_is_newcomer_bonus: row.kIsNewcomerBonus,
    k_is_returning_bonus: row.kIsReturningBonus,
    season: SEASON_LABEL,
  };
}
