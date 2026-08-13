import { MongoClient, type Db } from "mongodb";
import type { SupabaseClient } from "@supabase/supabase-js";
import { estimateTtr, isPlayerClass, type PlayerClass } from "@/lib/conversions";
import { nameKey } from "@/lib/name-key";
import { fetchAllRows } from "@/lib/supabase/fetchAll";
import {
  excludeKnownFalsePositives,
  findMarkerOnlyForfeits,
  FORFEIT_EXCLUSIONS,
  matchForfeits,
  readForfeitsFile,
  type MatchCandidateRow,
} from "@/lib/import/forfeits";
import { FORFEIT_OVERRIDES } from "@/lib/import/forfeit-overrides";
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

/** "25-26" -> ["24-25", "23-24"] — the two seasons immediately before `current`. */
function previousTwoSeasons(current: string): [string, string] {
  const start = Number(current.split("-")[0]);
  const pad = (n: number) => String(((n % 100) + 100) % 100).padStart(2, "0");
  return [`${pad(start - 1)}-${pad(start)}`, `${pad(start - 2)}-${pad(start - 1)}`];
}

/** "2026-2027" -> "2025-2026" — the SEASON_LABEL immediately before `current`. */
export function previousSeasonLabel(current: string): string {
  const [startYear, endYear] = current.split("-").map(Number);
  return `${startYear - 1}-${endYear - 1}`;
}

/**
 * Match-count and last-active-date per player, from the two seasons
 * immediately before the current one — feeds the experience/inactivity
 * K-factor bonus. `playerMatches` has no index leading with `season` alone,
 * so a query scoped to season(s) only is a full-collection scan that
 * reliably exceeds Cosmos DB's server-side command timeout no matter how few
 * seasons are in the filter; batched by player ID below (same fix as the
 * main season fetch) so each batch can use the (flttPlayerId, season, ...)
 * index instead.
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
  const seasons = previousTwoSeasons(currentSeason);
  try {
    const docs = await fetchInPlayerBatches(playerIds, (idBatch) =>
      db
        .collection<{ flttPlayerId: string; isoDate: string }>("playerMatches")
        .find(
          { flttPlayerId: { $in: idBatch }, season: { $in: seasons } },
          { projection: { _id: 0, flttPlayerId: 1, isoDate: 1 }, maxTimeMS: 55_000 },
        )
        .toArray(),
    );

    const statsByPlayer = new Map<string, { count: number; lastIsoDate: string | null }>();
    for (const d of docs) {
      const existing = statsByPlayer.get(d.flttPlayerId);
      if (existing) {
        existing.count++;
        if (!existing.lastIsoDate || d.isoDate > existing.lastIsoDate)
          existing.lastIsoDate = d.isoDate;
      } else {
        statsByPlayer.set(d.flttPlayerId, { count: 1, lastIsoDate: d.isoDate });
      }
    }
    const rows = Array.from(statsByPlayer, ([_id, v]) => ({ _id, ...v }));
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
  const forfeitedRowIds = excludeKnownFalsePositives(
    forfeitCandidateRows,
    new Set([...xlsxForfeitedRowIds, ...markerOnlyRowIds]),
    FORFEIT_EXCLUSIONS,
  );

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
  let exportHits = 0;
  let seasonStartHits = 0;
  const players: SimPlayer[] = supabasePlayers.map((p) => {
    const prior = priorStatsByNameKey.get(identityKey(p.name_key, p.club));
    const cls = p.class;
    const pfw = Number(p.pfw);
    const classementPoints = p.classement_points == null ? null : Number(p.classement_points);

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
    return {
      id: p.id,
      name: p.name,
      nameKey: identityKey(p.name_key, p.club),
      startingTtr,
      ageCategory: isAgeCategory(p.age_category) ? p.age_category : null,
      // A timed-out query means "no data available", not "confirmed zero
      // matches" — defaulting to 0/null here would wrongly flag every
      // player as a brand-new, long-inactive newcomer. Assume the opposite
      // (experienced, active) instead when we genuinely have no information.
      careerMatchesBeforeSeason: priorSeasonStatsTimedOut
        ? CAREER_MATCH_SAFE_DEFAULT
        : (prior?.count ?? 0),
      lastMatchIsoDateBeforeSeason: priorSeasonStatsTimedOut
        ? SEASON_START_ISO
        : (prior?.lastIsoDate ?? null),
    };
  });
  log(
    `  ${priorSeasonHits} of ${players.length} players carried forward their prior-season DTR; ` +
      `${overrideHits} more used a manual season-start correction; ${exportHits} more from FLTT's ` +
      `own export; ${seasonStartHits} more from their earliest match this season; the rest fall ` +
      `back to today's catalog class/PFW.`,
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

  const { matchRows, summary } = simulateSeason({
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
      `droppedNoOpponentRating=${summary.droppedNoOpponentRating} unresolvedPlayers=${summary.unresolvedPlayers}`,
  );

  return { matchRows, summary };
}

export async function runSeasonSimulation(
  supabase: SupabaseClient,
  log: (message: string) => void = () => {},
): Promise<RunSeasonSimulationResult> {
  const { matchRows, summary } = await computeSeasonSimulation(supabase, log);

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
    k_factor: row.kFactor,
    season: SEASON_LABEL,
  };
}
