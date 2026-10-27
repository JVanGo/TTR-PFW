import type { SupabaseClient } from "@supabase/supabase-js";
import { estimateTtr, isPlayerClass, type PlayerClass } from "@/lib/conversions";
import { nameKey } from "@/lib/name-key";
import { clubKey, identityKey } from "@/lib/identity-key";
import { previousSeasonLabel } from "@/lib/season";
import { fetchAllRows } from "@/lib/supabase/fetchAll";
import {
  excludeKnownFalsePositives,
  findMarkerOnlyForfeits,
  findPerformanceGapForfeits,
  FORFEIT_EXCLUSIONS,
  matchForfeits,
  PERFORMANCE_GAP_EXEMPT_PLAYERS,
  performanceGapMatchKey,
  readForfeitsFile,
  type MatchCandidateRow,
  type PerformanceGapRow,
} from "@/lib/import/forfeits";
import { FORFEIT_OVERRIDES } from "@/lib/import/forfeit-overrides";
import { fetchLatestTtrByPlayer } from "@/lib/supabase/latestTtr";
import { AGE_CATEGORIES, type AgeCategory } from "@/lib/import/age-categories";
import {
  fetchCatalogFromR2,
  fetchPlayerHistoryFromR2,
  mapPlayerHistoryToSeasonData,
  mapWithConcurrency,
  type MappedSeasonStartSnapshot,
} from "@/lib/import/r2-player-history";
import {
  readSeasonStartExportFile,
  SEASON_START_EXPORT_PATH,
} from "@/lib/import/season-start-export";
import {
  SEASON_START_OVERRIDES,
  RETURNING_PLAYER_PFW_OVERRIDES,
} from "@/lib/import/season-start-overrides";
import { FLTT_ID_OVERRIDES } from "@/lib/import/flttid-overrides";
import { resolveClubAlias } from "@/lib/import/club-aliases";
import { PLAYER_NAME_ALIASES } from "@/lib/import/player-name-aliases";
import {
  simulateSeason,
  ersteinstufungFor,
  inactivityDeductionAppliedAsOf,
  isMatchInactive,
  INACTIVITY_DEDUCTION_STAGE_3_TOTAL,
  type OutputMatchRow,
  type PlayerEndState,
  type RawSeasonMatch,
  type RawSeasonPlacement,
  type SimPlayer,
  type SimulationSummary,
} from "@/lib/import/ttr-simulation";

export const SEASON_LABEL = "2026-2027";
// Same season as SEASON_LABEL, in the "YY-YY" short form R2/FLTT's own data
// uses (as opposed to the "YYYY-YYYY" display form).
const SEASON_SHORT_LABEL = "26-27";
const SEASON_START_ISO = "2026-07-01";
// Each Teilrunde's [start, end) window, in order: Aug 1 2026 - Jan 1 2027
// ("Hironn"), then Jan 1 2027 - Aug 1 2027. A youth-bracket player only earns
// a given period's bonus (landing on that period's `end` date) if they
// played a graded match within that specific window.
const YOUTH_GROWTH_PERIODS = [
  { start: "2026-08-01", end: "2027-01-01" },
  { start: "2027-01-01", end: "2027-08-01" },
];

interface SeasonStartExportSnapshot {
  class: PlayerClass;
  pfw: number;
  classementPoints: number | null;
}

// Falls back to the match-history heuristic (mapPlayerHistoryToSeasonData's
// seasonStartSnapshot) for everyone when the export file isn't present —
// see season-start-export.ts.
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

interface SeasonMatchRow {
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
function resolveCompetition(m: Pick<SeasonMatchRow, "competition" | "rencontres">): string {
  return m.competition?.trim() || m.rencontres?.competition?.trim() || "";
}

/** `rencontres.points` is normally blank, but on some rows carries a raw JSON
 * blob straight from FLTT's own source with its own "forfeit":true/false
 * flag — see findMarkerOnlyForfeits in lib/import/forfeits.ts for why this is
 * treated as a secondary detection source, not the primary one. */
function hasForfeitMarker(m: Pick<SeasonMatchRow, "rencontres">): boolean {
  return (m.rencontres?.points ?? "").includes('"forfeit":true');
}

interface SeasonPlacementRow {
  flttPlayerId: string;
  isoDate: string;
  competition: string;
  tournamentPlacement: { place: number } | null;
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

// How many seasons back is "recent enough" for an exact last-match date —
// comfortably covers the Inaktivitätsabzug 36-month cap (see
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

export { previousSeasonLabel };

// How many R2 player-history files to fetch at once. R2's bucket has no
// server-side query/timeout to work around (unlike Cosmos), so this is just
// about being a reasonable citizen of the dataset owner's request quota —
// see "Cache data, avoid repeatedly scanning" in the integration guide.
const R2_FETCH_CONCURRENCY = 8;

/**
 * Fetches everything the season simulation needs from the R2 player-history
 * backup: the catalog (see fetchCatalogFromR2's doc comment for why that
 * needs a one-time full-bucket fetch), each player's season matches and
 * placements, their career match count/last-active date, and a season-start
 * rating snapshot when available. Replaced a Mongo-based equivalent that
 * needed careful player-ID batching to avoid Cosmos DB command timeouts —
 * R2 has no such server-side query to time out on, since each player's
 * whole history is just a single file fetch.
 */
async function fetchSeasonData(season: string, log: (message: string) => void) {
  const { catalog } = await fetchCatalogFromR2((done, total) => {
    if (done % 250 === 0 || done === total)
      log(`  R2 catalog: ${done}/${total} player files fetched...`);
  });

  const seasonMatches: SeasonMatchRow[] = [];
  const placements: SeasonPlacementRow[] = [];
  const priorSeasonAgg: { flttPlayerId: string; count: number; lastIsoDate: string | null }[] = [];
  const seasonStartByFlttId = new Map<string, MappedSeasonStartSnapshot>();
  const earliestClassByFlttId = new Map<string, PlayerClass>();
  const sentinelIso = staleLastMatchSentinelIso(SEASON_START_ISO);

  await mapWithConcurrency(catalog, R2_FETCH_CONCURRENCY, async (p) => {
    const history = await fetchPlayerHistoryFromR2(p.flttPlayerId);
    const mapped = mapPlayerHistoryToSeasonData(history, season);
    seasonMatches.push(...mapped.seasonMatches);
    placements.push(...mapped.placements);
    const { count, lastIsoDate } = mapped.priorSeasonStats;
    priorSeasonAgg.push({
      flttPlayerId: p.flttPlayerId,
      count,
      lastIsoDate: lastIsoDate ?? (count > 0 ? sentinelIso : null),
    });
    if (mapped.seasonStartSnapshot) {
      seasonStartByFlttId.set(p.flttPlayerId, mapped.seasonStartSnapshot);
    }
    if (mapped.earliestKnownClass) {
      earliestClassByFlttId.set(p.flttPlayerId, mapped.earliestKnownClass);
    }
  });

  return {
    seasonMatches,
    placements,
    catalog,
    priorSeasonAgg,
    seasonStartByFlttId,
    earliestClassByFlttId,
  };
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
  starting_dtr: number | null;
  starting_dtr_season: string | null;
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
  // A prior-season row can still name a since-merged club (e.g. "Bech" for
  // today's Mëllerdall), which would otherwise match neither same-name player.
  const known = clubKey(resolveClubAlias(knownClub));
  return (
    candidates.find((c) => c.club != null && clubKey(resolveClubAlias(c.club)) === known) ?? null
  );
}

export interface RunSeasonSimulationResult {
  summary: SimulationSummary;
  matchRowCount: number;
}

export interface SeasonSimulationResult {
  matchRows: OutputMatchRow[];
  summary: SimulationSummary;
  playerLastMatchDates: PlayerEndState[];
}

/**
 * The forfeits currently stored for SEASON_LABEL, as performanceGapMatchKey()s
 * — read before the season is replaced, so a re-run keeps forfeits whose
 * matches have since aged past the Performance-window cutoff (see
 * findPerformanceGapForfeits).
 */
async function fetchStoredForfeitKeys(supabase: SupabaseClient): Promise<Set<string>> {
  const rows: { player_id: string; match_date: string; opponent_name: string }[] = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("matches")
      .select("player_id, match_date, opponent_name")
      .eq("season", SEASON_LABEL)
      .eq("result", "FF")
      .order("id")
      .range(from, from + pageSize - 1);
    if (error) throw new Error(`fetchStoredForfeitKeys: ${error.message}`);
    rows.push(...(data ?? []));
    if (!data || data.length < pageSize) break;
  }
  if (rows.length === 0) return new Set();

  const players = await fetchAllRows<{ id: string; name: string }>(supabase, "players", "id, name");
  const nameById = new Map(players.map((p) => [p.id, p.name]));
  const keys = new Set<string>();
  for (const r of rows) {
    const name = nameById.get(r.player_id);
    if (name) keys.add(performanceGapMatchKey(r.match_date, name, r.opponent_name));
  }
  return keys;
}

/**
 * Fetches R2/Supabase inputs and runs the season simulation — everything
 * `runSeasonSimulation` does except the destructive delete+insert into
 * `matches`. Split out so an audit script can recompute the season and diff
 * it against what's actually stored in prod without writing anything.
 */
export async function computeSeasonSimulation(
  supabase: SupabaseClient,
  log: (message: string) => void = () => {},
): Promise<SeasonSimulationResult> {
  log("Fetching season data from R2 (player-history backup)...");
  const {
    seasonMatches,
    placements,
    catalog,
    priorSeasonAgg,
    seasonStartByFlttId,
    earliestClassByFlttId,
  } = await fetchSeasonData(SEASON_SHORT_LABEL, log);
  log(
    `  ${seasonMatches.length} match rows, ${placements.length} tournament placements, ${catalog.length} catalog players.`,
  );

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
  const xlsxAndMarkerForfeitedRowIds = new Set([...xlsxForfeitedRowIds, ...markerOnlyRowIds]);

  // Third signal, auto-applied directly since 2026-10-02 (track record: 73/73
  // confirmed 2026-08-15, then a second 5/5 random spot-check the day the
  // too-new crawl-lag filter below was added) — see findPerformanceGapForfeits'
  // own doc comment for the full history and why no per-case human sign-off
  // is needed anymore.
  const performanceGapRows: PerformanceGapRow[] = forfeitCandidateRows.map((r, i) => ({
    ...r,
    playerName: seasonMatches[i].playerName,
    hasPerformance: seasonMatches[i].hasPerformance,
  }));
  const storedForfeitKeys = await fetchStoredForfeitKeys(supabase);
  log(`  ${storedForfeitKeys.size} forfeits already stored for ${SEASON_LABEL} kept eligible.`);
  const { forfeitedRowIds: performanceGapRowIds } = findPerformanceGapForfeits(
    performanceGapRows,
    xlsxAndMarkerForfeitedRowIds,
    new Date().toISOString().slice(0, 10),
    PERFORMANCE_GAP_EXEMPT_PLAYERS,
    storedForfeitKeys,
  );
  if (performanceGapRowIds.size > 0) {
    log(
      `  ${performanceGapRowIds.size} more forfeited rows found via the Performance-table gap, ` +
        `not present in Forfaits.xlsx or FLTT's own internal marker.`,
    );
  }

  // Exclusions run last, against the full union of all three signals, so a
  // known false positive is vetoed regardless of which one produced it.
  const forfeitedRowIds = excludeKnownFalsePositives(
    forfeitCandidateRows,
    new Set([...xlsxAndMarkerForfeitedRowIds, ...performanceGapRowIds]),
    FORFEIT_EXCLUSIONS,
  );

  log("Loading players from Supabase...");
  const supabasePlayers = await fetchAllRows<SupabasePlayerRow>(
    supabase,
    "players",
    "id, name, name_key, club, class, pfw, classement_points, age_category, is_active, starting_dtr, starting_dtr_season",
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
  const seasonStartOverrideByFlttId = new Map(
    SEASON_START_OVERRIDES.map((o) => [o.flttPlayerId, o]),
  );
  const returningPfwOverrideByFlttId = new Map(
    RETURNING_PLAYER_PFW_OVERRIDES.map((o) => [o.flttPlayerId, o.pfw]),
  );

  const playersByNameKey = new Map<string, SupabasePlayerRow[]>();
  for (const p of supabasePlayers) {
    const list = playersByNameKey.get(p.name_key);
    if (list) list.push(p);
    else playersByNameKey.set(p.name_key, [p]);
  }
  // A renamed player's old name (still on opponents' rows) resolves to their
  // renamed row — unless someone else genuinely still has that name.
  for (const [oldName, newName] of Object.entries(PLAYER_NAME_ALIASES)) {
    const renamed = playersByNameKey.get(nameKey(newName));
    if (renamed && !playersByNameKey.has(nameKey(oldName))) {
      playersByNameKey.set(nameKey(oldName), renamed);
    }
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
  // name+club -> flttPlayerId, for name collisions no automatic signal can
  // resolve — see flttid-overrides.ts for why (R2's own per-candidate club is
  // always null, so the club comparison below can never succeed against a
  // real, non-null club on more than one candidate).
  const flttIdOverrideByKey = new Map<string, string>();
  for (const o of FLTT_ID_OVERRIDES) {
    flttIdOverrideByKey.set(`${nameKey(o.name)}|${clubKey(o.club)}`, o.flttPlayerId);
  }

  function resolveFlttId(candidateNameKey: string, knownClub: string | null): string | null {
    const override = flttIdOverrideByKey.get(`${candidateNameKey}|${clubKey(knownClub)}`);
    if (override) return override;
    const candidates = catalogByNameKey.get(candidateNameKey) ?? [];
    if (candidates.length <= 1) return candidates[0]?.flttPlayerId ?? null;
    return candidates.find((c) => clubKey(c.club) === clubKey(knownClub))?.flttPlayerId ?? null;
  }

  // Keyed by flttPlayerId directly — NOT by re-deriving an identityKey from
  // the R2 catalog's own club guess, which is often null (only about half
  // the catalog has real club coverage at all, since a player's own club
  // isn't in their own R2 file — see r2-catalog-sync.ts) and so silently
  // failed to match back to the Supabase player row's real club whenever the
  // catalog didn't know it. That defaulted careerMatchesBeforeSeason to 0 for
  // effectively every established player, wrongly applying the +4 newcomer
  // bonus at season start regardless of real career length — confirmed by
  // Jeff 2026-09-10 ("every player I checked started with the newcomer
  // bonus"). resolveFlttId() below already solves the exact same name+club
  // matching problem correctly (falls back to the sole same-name candidate
  // when there's no ambiguity to resolve instead of demanding an exact club
  // match), so this reuses its result per-player instead of a second,
  // less reliable identity lookup.
  const priorStatsByFlttId = new Map<string, PriorSeasonStats>();
  for (const row of priorSeasonAgg) {
    priorStatsByFlttId.set(row.flttPlayerId, {
      count: row.count,
      lastIsoDate: row.lastIsoDate,
    });
  }

  const isAgeCategory = (v: string | null): v is AgeCategory =>
    v != null && (AGE_CATEGORIES as readonly string[]).includes(v);

  const seasonStartExportByFlttId = loadSeasonStartExport(log);

  let adminStartHits = 0;
  let priorSeasonHits = 0;
  let returningOverrideHits = 0;
  let overrideHits = 0;
  let youthErsteinstufungHits = 0;
  let exportHits = 0;
  let seasonStartHits = 0;
  let earliestClassHits = 0;
  const players: SimPlayer[] = supabasePlayers.map((p) => {
    const flttId = resolveFlttId(p.name_key, p.club);
    const prior = flttId ? priorStatsByFlttId.get(flttId) : undefined;
    const cls = p.class;
    const pfw = Number(p.pfw);
    const classementPoints = p.classement_points == null ? null : Number(p.classement_points);
    const ageCategory = isAgeCategory(p.age_category) ? p.age_category : null;

    // Prefer the player's class/PFW/classement points as of the start of the
    // season over Supabase's `players` row, which only ever reflects the
    // latest catalog import — i.e. roughly where they ended up, not where
    // they started. Best source first: their own final DTR from the season
    // immediately prior (nothing to re-derive — they already have a real
    // computed rating), then a fresh federation PFW for a player confirmed
    // returning from a long absence (RETURNING_PLAYER_PFW_OVERRIDES), then a
    // manual correction (SEASON_START_OVERRIDES) for a player whose export
    // row had to be discarded, then FLTT's own season-start export when Jeff
    // has one on hand, then a snapshot inferred from their earliest match
    // this season (see mapPlayerHistoryToSeasonData's seasonStartSnapshot in
    // r2-player-history.ts for why either beats today's catalog), then —
    // still one notch better than today's catalog — the class FLTT's export
    // recorded them at on their EARLIEST match that season (earliestClass),
    // for a player whose matches never carry the richer snapshot at all
    // (common for classement-class players): a real mid-season promotion
    // (e.g. C2 -> B2) means "today's catalog" is their ENDING class, not
    // their starting one.
    const returningPfwOverride = flttId ? returningPfwOverrideByFlttId.get(flttId) : undefined;
    const seasonStartOverride = flttId ? seasonStartOverrideByFlttId.get(flttId) : undefined;
    const exportSnapshot = flttId ? seasonStartExportByFlttId.get(flttId) : undefined;
    const seasonStart: MappedSeasonStartSnapshot | undefined = flttId
      ? seasonStartByFlttId.get(flttId)
      : undefined;
    const earliestClass = flttId ? earliestClassByFlttId.get(flttId) : undefined;

    // Each source only "claims" the player if it actually produces a number —
    // a classement-class export/season-start row with no points recorded
    // yields null from estimateTtr(), and previously that null was taken as
    // final instead of falling through to the next source. That silently
    // dropped an established player (e.g. current B2, started the season as
    // C1) straight to the flat newcomer/age default, skipping every real
    // fallback meant to catch exactly this case.
    let startingTtr: number | null = null;
    // A starting DTR Jeff entered on the admin player form for THIS season
    // beats every source, the prior-season carry-forward included: it's an
    // explicit "start them here", the same call a pinned `ttr` in
    // SEASON_START_OVERRIDES makes, just without a code change. One entered
    // for an earlier season is ignored (see the starting_dtr migration).
    const adminStartingDtr =
      p.starting_dtr != null && p.starting_dtr_season === SEASON_LABEL ? p.starting_dtr : null;
    if (adminStartingDtr != null) {
      adminStartHits++;
      startingTtr = adminStartingDtr;
    }
    const priorSeasonDtr = startingTtr == null ? priorSeasonDtrByPlayerId.get(p.id) : undefined;
    if (priorSeasonDtr != null) {
      priorSeasonHits++;
      startingTtr = priorSeasonDtr;
    }
    if (startingTtr == null && returningPfwOverride != null && isPlayerClass(cls)) {
      const est = estimateTtr(returningPfwOverride, cls as PlayerClass, classementPoints);
      if (est != null) {
        returningOverrideHits++;
        startingTtr = est;
      }
    }
    if (startingTtr == null && seasonStartOverride) {
      // A pinned `ttr` (Jeff judging the class median not right for this
      // specific player) wins over the median stand-in when present.
      const est =
        seasonStartOverride.ttr ?? medianTtrByClass.get(seasonStartOverride.class) ?? null;
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
    if (startingTtr == null && earliestClass) {
      const est = medianTtrByClass.get(earliestClass) ?? null;
      if (est != null) {
        earliestClassHits++;
        startingTtr = est;
      }
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
    const lastMatchIsoDateBeforeSeason = prior?.lastIsoDate ?? null;
    return {
      id: p.id,
      name: p.name,
      nameKey: identityKey(p.name_key, p.club),
      startingTtr,
      ageCategory,
      careerMatchesBeforeSeason: prior?.count ?? 0,
      lastMatchIsoDateBeforeSeason,
      // Nonzero in two cases: (1) startingTtr was carried forward from the
      // player's own prior-season final DTR, the only case a deduction
      // could already be silently baked into the starting number; (2) a
      // RETURNING_PLAYER_PFW_OVERRIDES entry — the fresh federation PFW IS
      // the re-rating, so the deduction is treated as already fully paid
      // down rather than reapplied on top of it (their real match history
      // is untouched, so the newcomer/returning K-bonuses still apply
      // normally). Every other source seeds 0, so the checkpoints apply the
      // real deduction visibly, in full, the first time this feature
      // evaluates them.
      // An admin-set starting DTR is treated like case (2): Jeff's number is
      // where they start, so no deduction is taken off it.
      inactivityDeductionAlreadyApplied:
        adminStartingDtr != null || returningPfwOverride != null
          ? INACTIVITY_DEDUCTION_STAGE_3_TOTAL
          : priorSeasonDtr != null
            ? inactivityDeductionAppliedAsOf(lastMatchIsoDateBeforeSeason, SEASON_START_ISO)
            : 0,
    };
  });
  log(
    `  ${adminStartHits} of ${players.length} players used a starting DTR set on the admin page; ` +
      `${priorSeasonHits} more carried forward their prior-season DTR; ` +
      `${returningOverrideHits} more used a fresh federation PFW as a returning player; ` +
      `${overrideHits} more used a manual season-start correction; ${youthErsteinstufungHits} more ` +
      `used their age-based Ersteinstufung (D3 youth); ${exportHits} more from FLTT's own export; ` +
      `${seasonStartHits} more from their earliest match's own snapshot this season; ` +
      `${earliestClassHits} more from their earliest match's class alone (no snapshot on file); ` +
      `the rest fall back to today's catalog class/PFW.`,
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
    asOfIsoDate: new Date().toISOString().slice(0, 10),
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
 * Batch-updates players.last_match_date and players.is_active from a fresh
 * simulation run. last_match_date feeds the match-based "inactive" badge
 * (see isMatchInactive in lib/import/ttr-simulation.ts). is_active is
 * defined (per Jeff, 2026-09-09) as "not currently subject to
 * Inaktivitätsabzug" — the same rule, including its youth exemption: a
 * youth player (any age category) is always active regardless of match
 * recency, since the deduction itself never applies to them. Evaluated
 * fresh against today's date every run, so a player can cross the 24-month
 * threshold purely from time passing, without any new match data. Also
 * saves career_matches / returning_bonus_games_left, so the DTR-Rechner can
 * show the exact K of each player's next game. Chunked, same pattern as
 * other bulk players-table updates in this codebase.
 */
async function applyLastMatchDatesToSupabase(
  supabase: SupabaseClient,
  playerLastMatchDates: PlayerEndState[],
  log: (message: string) => void,
): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  let deactivated = 0;
  for (let i = 0; i < playerLastMatchDates.length; i += 200) {
    const chunk = playerLastMatchDates.slice(i, i + 200);
    const results = await Promise.all(
      chunk.map(
        ({ playerId, lastMatchIsoDate, ageCategory, careerMatches, returningGamesLeft }) => {
          const isActive = ageCategory != null || !isMatchInactive(lastMatchIsoDate, today);
          if (!isActive) deactivated++;
          return supabase
            .from("players")
            .update({
              last_match_date: lastMatchIsoDate,
              is_active: isActive,
              career_matches: careerMatches,
              returning_bonus_games_left: returningGamesLeft,
            })
            .eq("id", playerId);
        },
      ),
    );
    const failed = results.find((r) => r.error);
    if (failed?.error) throw new Error(failed.error.message);
  }
  log(
    `  ${playerLastMatchDates.length} players' last_match_date/is_active updated ` +
      `(${deactivated} now inactive — no match in 24+ months, not a youth player).`,
  );
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
