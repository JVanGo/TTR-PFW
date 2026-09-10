import type { AgeCategory } from "@/lib/import/age-categories";
import { nameKey } from "@/lib/name-key";

/**
 * Simulates the DTR (Dëschtennis-Rating) formula from DëschTennisRating.pdf
 * over an entire season's worth of matches, in true chronological order, so
 * later matches see the effect of earlier ones. Pure and Mongo/Supabase-free
 * so it can be unit tested against the PDF's own worked examples.
 */

const BASE_K = 16;
export const CAREER_MATCH_THRESHOLD = 30;
const CAREER_MATCH_BONUS = 4;
const INACTIVITY_MONTHS_THRESHOLD = 12;
const INACTIVITY_BONUS = 4;
const INACTIVITY_BONUS_MATCHES = 15;
const YOUTH_GROWTH_BONUS = 12;
const ERSTEINSTUFUNG_FLOOR_COMPETITION = "Ersteinstufung-Mindestwert";
const ERSTEINSTUFUNG_FLOOR_OPPONENT_LABEL = "Starting ranking floor";

// Inaktivitätsabzug: "-80 Punkte" after 24 months without a match, then
// another "-20" every further 6 months, capped at "-120" after 3 years.
// Stages are cumulative TOTALS (not increments) so a player checked for the
// first time after years away lands on the right total in one step.
const INACTIVITY_DEDUCTION_STAGE_1_MONTHS = 24;
const INACTIVITY_DEDUCTION_STAGE_2_MONTHS = 30;
const INACTIVITY_DEDUCTION_STAGE_3_MONTHS = 36;
const INACTIVITY_DEDUCTION_STAGE_1_TOTAL = 80;
const INACTIVITY_DEDUCTION_STAGE_2_TOTAL = 100;
// Exported for manual season-start overrides (see season-start-overrides.ts)
// that need to mark a player's Inaktivitätsabzug as already fully paid down.
export const INACTIVITY_DEDUCTION_STAGE_3_TOTAL = 120;
const INACTIVITY_DEDUCTION_COMPETITION = "Inaktivitätsabzug";
const INACTIVITY_DEDUCTION_OPPONENT_LABEL = "Inactivity deduction";

const PLACEMENT_TTR_BONUS: Record<1 | 2 | 3, number> = { 1: 15, 2: 10, 3: 5 };

// Competitions that never count towards the rating at all — no per-game
// score, no placement bonus either, unlike TOU club tournaments.
const NON_RATED_COMPETITION_PREFIXES = ["COU FELTEN"];

export function isNonRatedCompetition(competition: string): boolean {
  const upper = competition.toUpperCase();
  return NON_RATED_COMPETITION_PREFIXES.some((prefix) => upper.startsWith(prefix));
}

export function isTournamentCompetition(competition: string): boolean {
  const upper = competition.toUpperCase();
  return upper.startsWith("TOU ") || upper === "TOU";
}

/**
 * True for a stored `matches` row that's a genuine head-to-head game —
 * false for the four synthetic adjustment rows this simulation also writes
 * to the same table (tournament placement bonus, youth growth bonus,
 * Ersteinstufung floor reset, Inaktivitätsabzug). Mirrors the
 * player_season_summary view's own is_real_match filter — keep both in sync.
 */
export function isRealMatchRow(competition: string): boolean {
  return (
    !isTournamentCompetition(competition) &&
    competition !== ERSTEINSTUFUNG_FLOOR_COMPETITION &&
    competition !== "Nachwuchs-Spielstärkezuwachs" &&
    competition !== INACTIVITY_DEDUCTION_COMPETITION
  );
}

interface AgeRule {
  kBonus: number;
  ersteinstufung: number;
  youthGrowth: boolean;
}

// The PDF's own bonus labels give the resulting K directly: "+4 (20) Spieler
// unter 21 Jahre (Espoirs)" and "+8 (24) Spieler unter 15 Jahre (Cadets)" —
// these are NOT cumulative between brackets. A player in the u15 bracket
// gets +8 (K=24) on its own, not +4 stacked with +8 (K=28) — confirmed with
// the site owner. Poussin/Benjamin/Minime/Cadet fall under the u15 bracket;
// Junior/Espoirs fall under the (non-stacking) u21-only bracket.
//
// Junior's Ersteinstufung (950) is a site-specific addition beyond the PDF's
// own table, which only names CAD/MIN (900) and BJM/POU (850) — everyone
// U17+ is "adult" (1025) there. Jeff asked for a step between the two
// (2026-08-19): Junior beginners now start at 950 instead of the adult
// default; Espoirs still shares the adult value, matching the PDF as-is.
const AGE_RULES: Record<AgeCategory, AgeRule> = {
  Poussin: { kBonus: 8, ersteinstufung: 850, youthGrowth: true },
  Benjamin: { kBonus: 8, ersteinstufung: 850, youthGrowth: true },
  Minime: { kBonus: 8, ersteinstufung: 900, youthGrowth: true },
  Cadet: { kBonus: 8, ersteinstufung: 900, youthGrowth: true },
  Junior: { kBonus: 4, ersteinstufung: 950, youthGrowth: true },
  Espoirs: { kBonus: 4, ersteinstufung: 1025, youthGrowth: false },
};
const ADULT_RULE: AgeRule = { kBonus: 0, ersteinstufung: 1025, youthGrowth: false };

function ageRule(category: AgeCategory | null): AgeRule {
  return category ? AGE_RULES[category] : ADULT_RULE;
}

/**
 * The Ersteinstufung (season-starting rating) for an age category, or the
 * adult default for none. Exported so lib/ranking.ts's own "no matches yet"
 * fallback — used to show a DTR for players the simulation hasn't produced
 * any rows for — stays age-aware instead of defaulting every such player to
 * the flat adult value.
 */
export function ersteinstufungFor(category: AgeCategory | null): number {
  return ageRule(category).ersteinstufung;
}

/** Win probability for a player rated `ttrSelf` against `ttrOpponent`. */
export function winProbability(ttrSelf: number, ttrOpponent: number): number {
  return 1 / (1 + Math.pow(10, (ttrOpponent - ttrSelf) / 150));
}

/** TTR change for a single player: (result - expected) * K. */
export function ratingDelta(result: 0 | 1, winProb: number, k: number): number {
  return (result - winProb) * k;
}

function monthsBetween(fromIso: string, toIso: string): number {
  const from = new Date(fromIso);
  const to = new Date(toIso);
  return (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
}

/**
 * Total Inaktivitätsabzug points that should have been deducted as of
 * `referenceIsoDate`, as a positive magnitude (0/80/100/120) — the caller
 * applies it as a negative delta. `null` (no known match ever) returns 0:
 * inactivity means "was active, then stopped," not "never started" (same
 * reasoning as the newcomer K-bonus).
 */
export function inactivityDeductionAppliedAsOf(
  lastMatchIsoDate: string | null,
  referenceIsoDate: string,
): number {
  if (lastMatchIsoDate == null) return 0;
  const months = monthsBetween(lastMatchIsoDate, referenceIsoDate);
  if (months >= INACTIVITY_DEDUCTION_STAGE_3_MONTHS) return INACTIVITY_DEDUCTION_STAGE_3_TOTAL;
  if (months >= INACTIVITY_DEDUCTION_STAGE_2_MONTHS) return INACTIVITY_DEDUCTION_STAGE_2_TOTAL;
  if (months >= INACTIVITY_DEDUCTION_STAGE_1_MONTHS) return INACTIVITY_DEDUCTION_STAGE_1_TOTAL;
  return 0;
}

/** Whether the Inaktivitätsabzug badge should show as of `referenceIsoDate`. */
export function isMatchInactive(
  lastMatchIsoDate: string | null,
  referenceIsoDate: string,
): boolean {
  return inactivityDeductionAppliedAsOf(lastMatchIsoDate, referenceIsoDate) > 0;
}

export interface SimPlayer {
  id: string;
  name: string;
  nameKey: string;
  /** Current Estimated TTR, or null if unavailable (e.g. C1-D3 with no classement points yet). */
  startingTtr: number | null;
  ageCategory: AgeCategory | null;
  /** Rated singles played before this season, from Mongo history predating "25-26". */
  careerMatchesBeforeSeason: number;
  /** Date of their last match before this season, if any (for the inactivity bonus and Inaktivitätsabzug). */
  lastMatchIsoDateBeforeSeason: string | null;
  /**
   * Inaktivitätsabzug points already applied as of `lastMatchIsoDateBeforeSeason`
   * (positive magnitude, 0/80/100/120) — only nonzero when `startingTtr` was
   * carried forward from the player's own prior-season final DTR, since
   * that's the only case a deduction could already be silently baked into
   * the starting number. Prevents re-applying a deduction that's already
   * reflected in `startingTtr`.
   */
  inactivityDeductionAlreadyApplied: number;
}

export interface RawSeasonMatch {
  /** Stable per-row id (Mongo's own `id` field) — dedup/tiebreak key. */
  sortKey: string;
  isoDate: string;
  competition: string;
  playerNameKey: string;
  opponentNameKey: string;
  opponentName: string;
  score: string | null;
  won: boolean;
  /** True when this row was matched against a Forfaits.xlsx entry as a
   * confirmed clean-sweep forfeit (see lib/import/forfeits.ts) — scored as a
   * zero-delta "FF" instead of a normal win/loss. */
  isForfeit: boolean;
}

export interface RawSeasonPlacement {
  sortKey: string;
  isoDate: string;
  competition: string;
  playerNameKey: string;
  place: 1 | 2 | 3;
}

export interface SimulationInput {
  players: SimPlayer[];
  /** Fallback static TTR for opponents we can't resolve to a tracked player (e.g. from their catalog PFW). Keyed by nameKey(). */
  staticTtrByNameKey: Map<string, number>;
  matches: RawSeasonMatch[];
  placements: RawSeasonPlacement[];
  /**
   * Each Teilrunde's [start, end) window — a player in a youth-growth age
   * bracket gets the bonus on that period's `end` date only if they played a
   * graded match within that specific window, not merely somewhere this season.
   */
  youthGrowthPeriods: { start: string; end: string }[];
  /** ISO date the season starts (for the inactivity check). */
  seasonStartIsoDate: string;
}

export interface OutputMatchRow {
  playerId: string;
  matchDate: string;
  competition: string;
  opponentName: string | null;
  opponentPlayerId: string | null;
  opponentTtr: number | null;
  score: string | null;
  result: "W" | "L" | "FF";
  ttrDelta: number;
  newTtr: number;
  /** The Änderungskonstante (K) applied to this match, or null for a tournament-placement bonus. */
  kFactor: number | null;
  /** The age-bracket portion of `kFactor` (0, 4, or 8), or null alongside a null `kFactor`. */
  kAgeBonus: number | null;
  /** Whether the "fewer than 30 career matches" bonus (+4) contributed to `kFactor`, or null alongside a null `kFactor`. */
  kIsNewcomerBonus: boolean | null;
  /** Whether the "12+ months inactive" bonus (+4) contributed to `kFactor`, or null alongside a null `kFactor`. */
  kIsReturningBonus: boolean | null;
}

export interface SimulationSummary {
  matchesGraded: number;
  forfeitsApplied: number;
  tournamentGamesExcluded: number;
  nonRatedGamesExcluded: number;
  placementBonusesApplied: number;
  youthGrowthBonusesApplied: number;
  ersteinstufungFloorsApplied: number;
  inactivityDeductionsApplied: number;
  droppedNoOpponentRating: number;
  unresolvedPlayers: number;
}

export interface SimulationResult {
  matchRows: OutputMatchRow[];
  summary: SimulationSummary;
  /**
   * Every player's most recent real (non-forfeit) match date, if any, plus
   * their age category — for persisting `players.last_match_date` and
   * deriving `players.is_active` (see isMatchInactive: youth are exempt
   * from Inaktivitätsabzug entirely, regardless of match recency).
   */
  playerLastMatchDates: {
    playerId: string;
    lastMatchIsoDate: string | null;
    ageCategory: AgeCategory | null;
  }[];
}

interface RuntimeState {
  id: string;
  ttr: number;
  ageCategory: AgeCategory | null;
  careerMatches: number;
  inactivityBonusRemaining: number;
  /** Most recent date this player had a real (non-forfeit) result — updated as the season plays out. Drives Inaktivitätsabzug. */
  lastMatchIsoDate: string | null;
  /** Inaktivitätsabzug points applied so far this run (positive magnitude, 0/80/100/120), monotonically non-decreasing. */
  inactivityDeductionApplied: number;
}

interface KFactorBreakdown {
  k: number;
  ageBonus: number;
  isNewcomerBonus: boolean;
  isReturningBonus: boolean;
}

function kFactorBreakdown(state: RuntimeState): KFactorBreakdown {
  const ageBonus = ageRule(state.ageCategory).kBonus;
  const isNewcomerBonus = state.careerMatches < CAREER_MATCH_THRESHOLD;
  const isReturningBonus = state.inactivityBonusRemaining > 0;
  let k = BASE_K + ageBonus;
  if (isNewcomerBonus) k += CAREER_MATCH_BONUS;
  if (isReturningBonus) k += INACTIVITY_BONUS;
  return { k, ageBonus, isNewcomerBonus, isReturningBonus };
}

type CanonicalSide =
  | { kind: "tracked"; playerNameKey: string; won: boolean }
  | { kind: "untracked"; opponentName: string; won: boolean };

interface CanonicalMatch {
  isoDate: string;
  sortKey: string;
  competition: string;
  /** Score as recorded from `a`'s perspective (e.g. "3-2"), or null if unavailable. */
  score: string | null;
  isForfeit: boolean;
  a: { playerNameKey: string; won: boolean };
  b: CanonicalSide;
}

function reverseScore(score: string | null): string | null {
  if (!score) return null;
  const parts = score.split("-").map((s) => s.trim());
  if (parts.length !== 2) return null;
  return `${parts[1]}-${parts[0]}`;
}

/** The name-only part of an identityKey ("claude schmit|mëllerdall" -> "claude schmit"). */
function bareNameKeyOf(identity: string): string {
  return identity.split("|")[0];
}

/**
 * Mongo stores one row per participant, so a real match between two tracked
 * players shows up twice (once per perspective). Dedupe by (unordered pair of
 * players, date, competition) and keep only the first row seen — the second
 * row encodes the exact same match and would otherwise double-process it.
 *
 * That dedup only fires when BOTH rows resolve their opponent to a tracked
 * identity. Two different real players can share a name (see identityKey) —
 * when that name's own per-match club field doesn't cleanly match either
 * candidate's season catalog club, resolving *that* player as someone
 * else's opponent can fail even though their own row (self-identified via
 * flttPlayerId, not by name) resolves fine. One real match then produces two
 * events: a correctly "tracked" one from the successfully-resolved side, and
 * an "untracked" one from the failing side — double-counting the failing
 * side's own player (they get both their own untracked row AND the mirror
 * row the tracked pair produces for them). A first pass records, for every
 * successfully-tracked row, the (other player, date, competition, this
 * player's bare name) it covers, so the second pass can recognize an
 * untracked row as that same real match and drop it instead of duplicating it.
 */
function canonicalizeMatches(
  matches: RawSeasonMatch[],
  playerNameKeys: Set<string>,
): CanonicalMatch[] {
  const trackedMirrorCoverage = new Set<string>();
  for (const m of matches) {
    if (!playerNameKeys.has(m.opponentNameKey)) continue;
    trackedMirrorCoverage.add(
      `${m.opponentNameKey}|${m.isoDate}|${m.competition}|${bareNameKeyOf(m.playerNameKey)}`,
    );
  }

  // Mongo stores one row per participant, so a tracked-vs-tracked match's two
  // mirrored rows can independently carry different `isForfeit` values — only
  // the forfeiting player's OWN row was matched against Forfaits.xlsx, never
  // their opponent's. The dedup loop below keeps just one of the two raw rows
  // (whichever is encountered first) as canonical; without this map, a
  // forfeit's flag would be silently lost whenever the opponent's
  // (non-flagged) row happened to be the one kept.
  const forfeitByPairKey = new Map<string, boolean>();
  for (const m of matches) {
    if (!m.isForfeit || !playerNameKeys.has(m.opponentNameKey)) continue;
    const pairKey =
      [m.playerNameKey, m.opponentNameKey].sort().join("|") + "|" + m.isoDate + "|" + m.competition;
    forfeitByPairKey.set(pairKey, true);
  }

  const seenPairs = new Set<string>();
  const canonical: CanonicalMatch[] = [];

  for (const m of matches) {
    const opponentTracked = playerNameKeys.has(m.opponentNameKey);
    if (!opponentTracked) {
      const mirrorKey = `${m.playerNameKey}|${m.isoDate}|${m.competition}|${m.opponentNameKey}`;
      if (trackedMirrorCoverage.has(mirrorKey)) continue;
      canonical.push({
        isoDate: m.isoDate,
        sortKey: m.sortKey,
        competition: m.competition,
        score: m.score,
        isForfeit: m.isForfeit,
        a: { playerNameKey: m.playerNameKey, won: m.won },
        b: { kind: "untracked", opponentName: m.opponentName, won: !m.won },
      });
      continue;
    }

    const pairKey =
      [m.playerNameKey, m.opponentNameKey].sort().join("|") + "|" + m.isoDate + "|" + m.competition;
    if (seenPairs.has(pairKey)) continue;
    seenPairs.add(pairKey);
    canonical.push({
      isoDate: m.isoDate,
      sortKey: m.sortKey,
      competition: m.competition,
      score: m.score,
      isForfeit: forfeitByPairKey.get(pairKey) ?? false,
      a: { playerNameKey: m.playerNameKey, won: m.won },
      b: { kind: "tracked", playerNameKey: m.opponentNameKey, won: !m.won },
    });
  }

  return canonical;
}

type SeasonEvent =
  | { kind: "match"; isoDate: string; sortKey: string; match: CanonicalMatch }
  | { kind: "placement"; isoDate: string; sortKey: string; placement: RawSeasonPlacement };

function sortEvents(a: SeasonEvent, b: SeasonEvent): number {
  if (a.isoDate !== b.isoDate) return a.isoDate < b.isoDate ? -1 : 1;
  return a.sortKey < b.sortKey ? -1 : a.sortKey > b.sortKey ? 1 : 0;
}

export function simulateSeason(input: SimulationInput): SimulationResult {
  const states = new Map<string, RuntimeState>();
  const playerByNameKey = new Map<string, SimPlayer>();
  for (const p of input.players) {
    playerByNameKey.set(p.nameKey, p);
    const startingTtr = p.startingTtr ?? ageRule(p.ageCategory).ersteinstufung;
    // Inactivity means "was active, then stopped" — a player with no prior
    // match at all (lastMatchIsoDateBeforeSeason == null) has nothing to have
    // gone inactive from; that's what the newcomer bonus already covers, and
    // stacking both on a brand-new player double-counts the same situation.
    const inactive =
      p.lastMatchIsoDateBeforeSeason != null &&
      monthsBetween(p.lastMatchIsoDateBeforeSeason, input.seasonStartIsoDate) >=
        INACTIVITY_MONTHS_THRESHOLD;
    states.set(p.nameKey, {
      id: p.id,
      ttr: startingTtr,
      ageCategory: p.ageCategory,
      careerMatches: p.careerMatchesBeforeSeason,
      inactivityBonusRemaining: inactive ? INACTIVITY_BONUS_MATCHES : 0,
      lastMatchIsoDate: p.lastMatchIsoDateBeforeSeason,
      inactivityDeductionApplied: p.inactivityDeductionAlreadyApplied,
    });
  }

  const trackedNameKeys = new Set(playerByNameKey.keys());
  const summary: SimulationSummary = {
    matchesGraded: 0,
    forfeitsApplied: 0,
    tournamentGamesExcluded: 0,
    nonRatedGamesExcluded: 0,
    placementBonusesApplied: 0,
    youthGrowthBonusesApplied: 0,
    ersteinstufungFloorsApplied: 0,
    inactivityDeductionsApplied: 0,
    droppedNoOpponentRating: 0,
    unresolvedPlayers: 0,
  };

  const gradedMatches: RawSeasonMatch[] = [];
  for (const m of input.matches) {
    if (isTournamentCompetition(m.competition)) {
      summary.tournamentGamesExcluded++;
      continue;
    }
    if (isNonRatedCompetition(m.competition)) {
      summary.nonRatedGamesExcluded++;
      continue;
    }
    gradedMatches.push(m);
  }

  const canonicalMatches = canonicalizeMatches(gradedMatches, trackedNameKeys);

  // A player only qualifies for a Teilrunde's youth growth bonus if they
  // actually played a graded match within that specific Teilrunde — not just
  // somewhere in the season. Each period's bonus lands on its own `end` date
  // and is scoped to matches on [start, end).
  const playedByPeriodEnd = new Map<string, Set<string>>();
  for (const period of input.youthGrowthPeriods) {
    const played = new Set<string>();
    for (const m of canonicalMatches) {
      if (m.isoDate < period.start || m.isoDate >= period.end) continue;
      if (m.isForfeit) continue; // a forfeit isn't "having played"
      played.add(m.a.playerNameKey);
      if (m.b.kind === "tracked") played.add(m.b.playerNameKey);
    }
    playedByPeriodEnd.set(period.end, played);
  }

  const events: SeasonEvent[] = [
    ...canonicalMatches.map((match) => ({
      kind: "match" as const,
      isoDate: match.isoDate,
      sortKey: match.sortKey,
      match,
    })),
    ...input.placements.map((placement) => ({
      kind: "placement" as const,
      isoDate: placement.isoDate,
      sortKey: placement.sortKey,
      placement,
    })),
  ].sort(sortEvents);

  const matchRows: OutputMatchRow[] = [];
  const growthDatesApplied = new Set<string>();
  const sortedGrowthDates = [...playedByPeriodEnd.keys()].sort();

  // "Bei Jugendspielern gilt, dass sie, falls sie beim Erstellen einer
  // Rangliste unter ihrem Ersteinstufungswert liegen, ihren DTR-Wert wieder
  // auf diesen Ersteinstufungswert zurückgesetzt bekommen." The PDF names no
  // periodic "Rangliste creation" date of its own, so this reuses the same
  // Teilrunde-boundary dates as the growth bonus (the only recurring
  // recompute point that exists). Unlike the growth bonus, there's no
  // "played this period" condition — a floor-up is just a snapshot check
  // against the player's current rating. Only the categories with their own
  // below-adult Ersteinstufung value are in scope (Poussin/Benjamin/Minime/
  // Cadet/Junior as of the current AGE_RULES table) — Espoirs shares the
  // adult Ersteinstufung and is never floored by this rule.
  const floorDatesApplied = new Set<string>();

  const applyErsteinstufungFloorIfDue = (isoDate: string) => {
    for (const floorDate of sortedGrowthDates) {
      if (floorDatesApplied.has(floorDate) || isoDate < floorDate) continue;
      for (const state of states.values()) {
        const rule = ageRule(state.ageCategory);
        if (rule.ersteinstufung >= ADULT_RULE.ersteinstufung) continue;
        if (state.ttr >= rule.ersteinstufung) continue;
        const newTtr = rule.ersteinstufung;
        matchRows.push({
          playerId: state.id,
          matchDate: floorDate,
          competition: ERSTEINSTUFUNG_FLOOR_COMPETITION,
          opponentName: ERSTEINSTUFUNG_FLOOR_OPPONENT_LABEL,
          opponentPlayerId: null,
          opponentTtr: null,
          score: null,
          result: "W",
          ttrDelta: newTtr - state.ttr,
          newTtr,
          kFactor: null,
          kAgeBonus: null,
          kIsNewcomerBonus: null,
          kIsReturningBonus: null,
        });
        state.ttr = newTtr;
        summary.ersteinstufungFloorsApplied++;
      }
      floorDatesApplied.add(floorDate);
    }
  };

  const applyGrowthIfDue = (isoDate: string) => {
    for (const growthDate of sortedGrowthDates) {
      if (growthDatesApplied.has(growthDate) || isoDate < growthDate) continue;
      const playedThisPeriod = playedByPeriodEnd.get(growthDate)!;
      for (const [key, state] of states) {
        if (!ageRule(state.ageCategory).youthGrowth) continue;
        if (!playedThisPeriod.has(key)) continue;
        const newTtr = state.ttr + YOUTH_GROWTH_BONUS;
        matchRows.push({
          playerId: state.id,
          matchDate: growthDate,
          competition: "Nachwuchs-Spielstärkezuwachs",
          opponentName: "Youth growth bonus",
          opponentPlayerId: null,
          opponentTtr: null,
          score: null,
          result: "W",
          ttrDelta: YOUTH_GROWTH_BONUS,
          newTtr,
          kFactor: null,
          kAgeBonus: null,
          kIsNewcomerBonus: null,
          kIsReturningBonus: null,
        });
        state.ttr = newTtr;
        summary.youthGrowthBonusesApplied++;
      }
      growthDatesApplied.add(growthDate);
    }
  };

  // Same recurring Teilrunde checkpoints as the two rules above — the PDF
  // names no dedicated recompute date for Inaktivitätsabzug either. Youth
  // players (any age category) are exempt; the PDF's other exemption
  // ("Spieler mit ausländischer Spielberechtigung") has no data source yet
  // and isn't applied. Tracks a cumulative TOTAL per player rather than
  // per-stage flags, so a player checked for the first time after years away
  // jumps straight to the right total in one row instead of one row per stage.
  const inactivityDeductionDatesApplied = new Set<string>();

  const applyInactivityDeductionIfDue = (isoDate: string) => {
    for (const checkpointDate of sortedGrowthDates) {
      if (inactivityDeductionDatesApplied.has(checkpointDate) || isoDate < checkpointDate) continue;
      for (const state of states.values()) {
        if (state.ageCategory != null) continue;
        const target = inactivityDeductionAppliedAsOf(state.lastMatchIsoDate, checkpointDate);
        if (target <= state.inactivityDeductionApplied) continue;
        const delta = -(target - state.inactivityDeductionApplied);
        const newTtr = state.ttr + delta;
        matchRows.push({
          playerId: state.id,
          matchDate: checkpointDate,
          competition: INACTIVITY_DEDUCTION_COMPETITION,
          opponentName: INACTIVITY_DEDUCTION_OPPONENT_LABEL,
          opponentPlayerId: null,
          opponentTtr: null,
          score: null,
          result: "L",
          ttrDelta: delta,
          newTtr,
          kFactor: null,
          kAgeBonus: null,
          kIsNewcomerBonus: null,
          kIsReturningBonus: null,
        });
        state.ttr = newTtr;
        state.inactivityDeductionApplied = target;
        summary.inactivityDeductionsApplied++;
      }
      inactivityDeductionDatesApplied.add(checkpointDate);
    }
  };

  interface DayRow extends OutputMatchRow {
    settleKey: string;
  }

  // Ratings are stable for a whole matchday: every match/placement on a given
  // date is scored using each player's rating as it stood BEFORE that day's
  // play began (nothing they, or their same-day opponents, do earlier that
  // same day moves the number mid-day). All of a day's results are summed and
  // applied once, at the end of the day, and every row from that day displays
  // the same settled "new TTR" — each row still shows its own individual
  // point change (ttrDelta), just not its own running total.
  let i = 0;
  while (i < events.length) {
    const dayIso = events[i].isoDate;
    applyErsteinstufungFloorIfDue(dayIso);
    applyGrowthIfDue(dayIso);
    applyInactivityDeductionIfDue(dayIso);

    const dayRows: DayRow[] = [];
    const pendingDelta = new Map<string, number>();
    const pendingMatchCount = new Map<string, number>();
    const touched = new Set<string>();

    const addDelta = (key: string, amount: number) => {
      pendingDelta.set(key, (pendingDelta.get(key) ?? 0) + amount);
      touched.add(key);
    };
    const addMatchPlayed = (key: string) => {
      pendingMatchCount.set(key, (pendingMatchCount.get(key) ?? 0) + 1);
    };

    while (i < events.length && events[i].isoDate === dayIso) {
      const event = events[i];
      i++;

      if (event.kind === "placement") {
        const state = states.get(event.placement.playerNameKey);
        if (!state) {
          summary.unresolvedPlayers++;
          continue;
        }
        const bonus = PLACEMENT_TTR_BONUS[event.placement.place];
        dayRows.push({
          settleKey: event.placement.playerNameKey,
          playerId: state.id,
          matchDate: event.placement.isoDate,
          competition: event.placement.competition,
          opponentName: `Tournament — ${event.placement.place === 1 ? "1st" : event.placement.place === 2 ? "2nd" : "3rd"} place`,
          opponentPlayerId: null,
          opponentTtr: null,
          score: null,
          result: event.placement.place === 3 ? "L" : "W",
          ttrDelta: bonus,
          newTtr: 0, // filled in once the day settles, below
          kFactor: null,
          kAgeBonus: null,
          kIsNewcomerBonus: null,
          kIsReturningBonus: null,
        });
        addDelta(event.placement.playerNameKey, bonus);
        summary.placementBonusesApplied++;
        continue;
      }

      const { match } = event;
      const stateA = states.get(match.a.playerNameKey);
      if (!stateA) {
        summary.unresolvedPlayers++;
        continue;
      }

      let ttrBSnapshot: number;
      let opponentPlayerId: string | null = null;
      let opponentDisplayName: string;
      let stateB: RuntimeState | null = null;
      let stateBKey: string | null = null;

      if (match.b.kind === "tracked") {
        const found = states.get(match.b.playerNameKey);
        if (!found) {
          summary.unresolvedPlayers++;
          continue;
        }
        stateB = found;
        stateBKey = match.b.playerNameKey;
        ttrBSnapshot = found.ttr; // frozen: not mutated until this day settles
        opponentPlayerId = found.id;
        opponentDisplayName = playerByNameKey.get(match.b.playerNameKey)?.name ?? "";
      } else {
        const fallback = input.staticTtrByNameKey.get(nameKey(match.b.opponentName));
        if (fallback == null) {
          summary.droppedNoOpponentRating++;
          continue;
        }
        ttrBSnapshot = fallback;
        opponentDisplayName = match.b.opponentName;
      }

      const ttrASnapshot = stateA.ttr; // frozen: not mutated until this day settles

      // A confirmed forfeit (see lib/import/forfeits.ts): no rating change for
      // either side, and it doesn't count as a played match — no addDelta/
      // addMatchPlayed, so career-match count and the inactivity bonus are
      // untouched. Still shown in history with the real opponent/score for
      // context, just with result "FF" instead of a computed win/loss.
      if (match.isForfeit) {
        dayRows.push({
          settleKey: match.a.playerNameKey,
          playerId: stateA.id,
          matchDate: match.isoDate,
          competition: match.competition,
          opponentName: match.b.kind === "untracked" ? match.b.opponentName : opponentDisplayName,
          opponentPlayerId,
          opponentTtr: Math.round(ttrBSnapshot),
          score: match.score,
          result: "FF",
          ttrDelta: 0,
          newTtr: 0,
          kFactor: null,
          kAgeBonus: null,
          kIsNewcomerBonus: null,
          kIsReturningBonus: null,
        });
        summary.forfeitsApplied++;

        if (stateB && stateBKey) {
          dayRows.push({
            settleKey: stateBKey,
            playerId: stateB.id,
            matchDate: match.isoDate,
            competition: match.competition,
            opponentName: playerByNameKey.get(match.a.playerNameKey)?.name ?? "",
            opponentPlayerId: stateA.id,
            opponentTtr: Math.round(ttrASnapshot),
            score: reverseScore(match.score),
            result: "FF",
            ttrDelta: 0,
            newTtr: 0,
            kFactor: null,
            kAgeBonus: null,
            kIsNewcomerBonus: null,
            kIsReturningBonus: null,
          });
          summary.forfeitsApplied++;
        }
        continue;
      }

      const breakdownA = kFactorBreakdown(stateA);
      const kA = breakdownA.k;
      const paWinA = winProbability(ttrASnapshot, ttrBSnapshot);
      const resultA: 0 | 1 = match.a.won ? 1 : 0;
      const deltaA = Math.round(ratingDelta(resultA, paWinA, kA));

      dayRows.push({
        settleKey: match.a.playerNameKey,
        playerId: stateA.id,
        matchDate: match.isoDate,
        competition: match.competition,
        opponentName: match.b.kind === "untracked" ? match.b.opponentName : opponentDisplayName,
        opponentPlayerId,
        opponentTtr: Math.round(ttrBSnapshot),
        score: match.score,
        result: match.a.won ? "W" : "L",
        ttrDelta: deltaA,
        newTtr: 0,
        kFactor: kA,
        kAgeBonus: breakdownA.ageBonus,
        kIsNewcomerBonus: breakdownA.isNewcomerBonus,
        kIsReturningBonus: breakdownA.isReturningBonus,
      });
      addDelta(match.a.playerNameKey, deltaA);
      addMatchPlayed(match.a.playerNameKey);
      summary.matchesGraded++;

      if (stateB && stateBKey) {
        const breakdownB = kFactorBreakdown(stateB);
        const kB = breakdownB.k;
        const paWinB = 1 - paWinA;
        const resultB: 0 | 1 = match.b.won ? 1 : 0;
        const deltaB = Math.round(ratingDelta(resultB, paWinB, kB));

        dayRows.push({
          settleKey: stateBKey,
          playerId: stateB.id,
          matchDate: match.isoDate,
          competition: match.competition,
          opponentName: playerByNameKey.get(match.a.playerNameKey)?.name ?? "",
          opponentPlayerId: stateA.id,
          opponentTtr: Math.round(ttrASnapshot),
          score: reverseScore(match.score),
          result: match.b.won ? "W" : "L",
          ttrDelta: deltaB,
          newTtr: 0,
          kFactor: kB,
          kAgeBonus: breakdownB.ageBonus,
          kIsNewcomerBonus: breakdownB.isNewcomerBonus,
          kIsReturningBonus: breakdownB.isReturningBonus,
        });
        addDelta(stateBKey, deltaB);
        addMatchPlayed(stateBKey);
        summary.matchesGraded++;
      }
    }

    // Settle the day: apply every touched player's accumulated change once.
    for (const key of touched) {
      const state = states.get(key)!;
      const delta = pendingDelta.get(key) ?? 0;
      const matchesToday = pendingMatchCount.get(key) ?? 0;
      state.ttr = state.ttr + delta;
      state.careerMatches += matchesToday;
      state.inactivityBonusRemaining = Math.max(0, state.inactivityBonusRemaining - matchesToday);
      // `touched` is populated only via addDelta — placements and real
      // graded wins/losses, never forfeits — so this is exactly "had a real
      // result today," the right signal for the Inaktivitätsabzug clock.
      state.lastMatchIsoDate = dayIso;
    }

    for (const { settleKey, ...row } of dayRows) {
      matchRows.push({ ...row, newTtr: states.get(settleKey)?.ttr ?? row.newTtr });
    }
  }

  // A period's bonus is earned by having played within it, not by some
  // later match happening to exist to trigger the check during the loop
  // above — if the season's last recorded match falls before a period's end
  // date (e.g. no match yet on/after Aug 1), that period would otherwise
  // never get applied to anyone. Force each remaining period through once
  // events run out.
  for (const growthDate of sortedGrowthDates) {
    applyErsteinstufungFloorIfDue(growthDate);
    applyGrowthIfDue(growthDate);
    applyInactivityDeductionIfDue(growthDate);
  }

  const playerLastMatchDates = Array.from(states.values(), (s) => ({
    playerId: s.id,
    lastMatchIsoDate: s.lastMatchIsoDate,
    ageCategory: s.ageCategory,
  }));

  return { matchRows, summary, playerLastMatchDates };
}
