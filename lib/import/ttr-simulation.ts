import type { AgeCategory } from "@/lib/import/age-categories";
import { nameKey } from "@/lib/name-key";

/**
 * Simulates the DTR (Dëschtennis-Rating) formula from DëschTennisRating.pdf
 * over an entire season's worth of matches, in true chronological order, so
 * later matches see the effect of earlier ones. Pure and Mongo/Supabase-free
 * so it can be unit tested against the PDF's own worked examples.
 */

const BASE_K = 16;
const CAREER_MATCH_THRESHOLD = 30;
const CAREER_MATCH_BONUS = 4;
const INACTIVITY_MONTHS_THRESHOLD = 12;
const INACTIVITY_BONUS = 4;
const INACTIVITY_BONUS_MATCHES = 15;
const YOUTH_GROWTH_BONUS = 12;

const PLACEMENT_TTR_BONUS: Record<1 | 2 | 3, number> = { 1: 24, 2: 16, 3: 8 };

// Competitions that never count towards the rating at all — no per-game
// score, no placement bonus either, unlike TOU club tournaments.
const NON_RATED_COMPETITION_PREFIXES = ["COU FELTEN"];

function isNonRatedCompetition(competition: string): boolean {
  const upper = competition.toUpperCase();
  return NON_RATED_COMPETITION_PREFIXES.some((prefix) => upper.startsWith(prefix));
}

interface AgeRule {
  kBonus: number;
  ersteinstufung: number;
  youthGrowth: boolean;
}

// See plan: PDF labels the u21 bracket "Espoirs" and the u15 bracket "Cadets";
// Poussin/Benjamin/Minime/Cadet fall under both (u15 implies u21), Junior and
// Espoirs only under u21. Confirmed with the site owner — not exact birthdate
// cutoffs, since the source data has no birthdates.
const AGE_RULES: Record<AgeCategory, AgeRule> = {
  Poussin: { kBonus: 12, ersteinstufung: 850, youthGrowth: true },
  Benjamin: { kBonus: 12, ersteinstufung: 850, youthGrowth: true },
  Minime: { kBonus: 12, ersteinstufung: 900, youthGrowth: true },
  Cadet: { kBonus: 12, ersteinstufung: 900, youthGrowth: true },
  Junior: { kBonus: 4, ersteinstufung: 1025, youthGrowth: true },
  Espoirs: { kBonus: 4, ersteinstufung: 1025, youthGrowth: false },
};
const ADULT_RULE: AgeRule = { kBonus: 0, ersteinstufung: 1025, youthGrowth: false };

function ageRule(category: AgeCategory | null): AgeRule {
  return category ? AGE_RULES[category] : ADULT_RULE;
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

export interface SimPlayer {
  id: string;
  name: string;
  nameKey: string;
  /** Current Estimated TTR, or null if unavailable (e.g. C1-D3 with no classement points yet). */
  startingTtr: number | null;
  ageCategory: AgeCategory | null;
  /** Rated singles played before this season, from Mongo history predating "25-26". */
  careerMatchesBeforeSeason: number;
  /** Date of their last match before this season, if any (for the inactivity bonus). */
  lastMatchIsoDateBeforeSeason: string | null;
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
  /** ISO date the youth growth bonus lands on (the season's Jan 1). */
  youthGrowthIsoDate: string;
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
  result: "W" | "L";
  ttrDelta: number;
  newTtr: number;
}

export interface SimulationSummary {
  matchesGraded: number;
  tournamentGamesExcluded: number;
  nonRatedGamesExcluded: number;
  placementBonusesApplied: number;
  droppedNoOpponentRating: number;
  unresolvedPlayers: number;
}

export interface SimulationResult {
  matchRows: OutputMatchRow[];
  summary: SimulationSummary;
}

interface RuntimeState {
  id: string;
  ttr: number;
  ageCategory: AgeCategory | null;
  careerMatches: number;
  inactivityBonusRemaining: number;
}

function kFactor(state: RuntimeState): number {
  let k = BASE_K + ageRule(state.ageCategory).kBonus;
  if (state.careerMatches < CAREER_MATCH_THRESHOLD) k += CAREER_MATCH_BONUS;
  if (state.inactivityBonusRemaining > 0) k += INACTIVITY_BONUS;
  return k;
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
  a: { playerNameKey: string; won: boolean };
  b: CanonicalSide;
}

function reverseScore(score: string | null): string | null {
  if (!score) return null;
  const parts = score.split("-").map((s) => s.trim());
  if (parts.length !== 2) return null;
  return `${parts[1]}-${parts[0]}`;
}

/**
 * Mongo stores one row per participant, so a real match between two tracked
 * players shows up twice (once per perspective). Dedupe by (unordered pair of
 * players, date, competition) and keep only the first row seen — the second
 * row encodes the exact same match and would otherwise double-process it.
 */
function canonicalizeMatches(
  matches: RawSeasonMatch[],
  playerNameKeys: Set<string>,
): CanonicalMatch[] {
  const seenPairs = new Set<string>();
  const canonical: CanonicalMatch[] = [];

  for (const m of matches) {
    const opponentTracked = playerNameKeys.has(m.opponentNameKey);
    if (!opponentTracked) {
      canonical.push({
        isoDate: m.isoDate,
        sortKey: m.sortKey,
        competition: m.competition,
        score: m.score,
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
    const inactive =
      p.lastMatchIsoDateBeforeSeason == null ||
      monthsBetween(p.lastMatchIsoDateBeforeSeason, input.seasonStartIsoDate) >=
        INACTIVITY_MONTHS_THRESHOLD;
    states.set(p.nameKey, {
      id: p.id,
      ttr: startingTtr,
      ageCategory: p.ageCategory,
      careerMatches: p.careerMatchesBeforeSeason,
      inactivityBonusRemaining: inactive ? INACTIVITY_BONUS_MATCHES : 0,
    });
  }

  const trackedNameKeys = new Set(playerByNameKey.keys());
  const summary: SimulationSummary = {
    matchesGraded: 0,
    tournamentGamesExcluded: 0,
    nonRatedGamesExcluded: 0,
    placementBonusesApplied: 0,
    droppedNoOpponentRating: 0,
    unresolvedPlayers: 0,
  };

  const gradedMatches: RawSeasonMatch[] = [];
  for (const m of input.matches) {
    if (m.competition.toUpperCase().startsWith("TOU ") || m.competition.toUpperCase() === "TOU") {
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
  let growthApplied = false;

  const applyGrowthIfDue = (isoDate: string) => {
    if (growthApplied || isoDate < input.youthGrowthIsoDate) return;
    for (const state of states.values()) {
      if (ageRule(state.ageCategory).youthGrowth) {
        state.ttr += YOUTH_GROWTH_BONUS;
      }
    }
    growthApplied = true;
  };

  for (const event of events) {
    applyGrowthIfDue(event.isoDate);

    if (event.kind === "placement") {
      const state = states.get(event.placement.playerNameKey);
      if (!state) {
        summary.unresolvedPlayers++;
        continue;
      }
      const bonus = PLACEMENT_TTR_BONUS[event.placement.place];
      const newTtr = Math.round(state.ttr + bonus);
      matchRows.push({
        playerId: state.id,
        matchDate: event.placement.isoDate,
        competition: event.placement.competition,
        opponentName: `Tournament — ${event.placement.place === 1 ? "1st" : event.placement.place === 2 ? "2nd" : "3rd"} place`,
        opponentPlayerId: null,
        opponentTtr: null,
        score: null,
        result: event.placement.place === 3 ? "L" : "W",
        ttrDelta: bonus,
        newTtr,
      });
      state.ttr = newTtr;
      summary.placementBonusesApplied++;
      continue;
    }

    const { match } = event;
    const stateA = states.get(match.a.playerNameKey);
    if (!stateA) {
      summary.unresolvedPlayers++;
      continue;
    }

    let ttrB: number;
    let opponentPlayerId: string | null = null;
    let opponentDisplayName: string;
    let stateB: RuntimeState | null = null;

    if (match.b.kind === "tracked") {
      const found = states.get(match.b.playerNameKey);
      if (!found) {
        summary.unresolvedPlayers++;
        continue;
      }
      stateB = found;
      ttrB = found.ttr;
      opponentPlayerId = found.id;
      opponentDisplayName = playerByNameKey.get(match.b.playerNameKey)?.name ?? "";
    } else {
      const fallback = input.staticTtrByNameKey.get(nameKey(match.b.opponentName));
      if (fallback == null) {
        summary.droppedNoOpponentRating++;
        continue;
      }
      ttrB = fallback;
      opponentDisplayName = match.b.opponentName;
    }

    const ttrASnapshot = stateA.ttr;
    const ttrBSnapshot = ttrB;
    const kA = kFactor(stateA);
    const paWinA = winProbability(ttrASnapshot, ttrBSnapshot);
    const resultA: 0 | 1 = match.a.won ? 1 : 0;
    const deltaA = ratingDelta(resultA, paWinA, kA);
    const newTtrA = Math.round(ttrASnapshot + deltaA);

    matchRows.push({
      playerId: stateA.id,
      matchDate: match.isoDate,
      competition: match.competition,
      opponentName: match.b.kind === "untracked" ? match.b.opponentName : opponentDisplayName,
      opponentPlayerId,
      opponentTtr: Math.round(ttrBSnapshot),
      score: match.score,
      result: match.a.won ? "W" : "L",
      ttrDelta: Math.round(deltaA),
      newTtr: newTtrA,
    });
    stateA.ttr = newTtrA;
    stateA.careerMatches++;
    if (stateA.inactivityBonusRemaining > 0) stateA.inactivityBonusRemaining--;
    summary.matchesGraded++;

    if (stateB) {
      const kB = kFactor(stateB);
      const paWinB = 1 - paWinA;
      const resultB: 0 | 1 = match.b.won ? 1 : 0;
      const deltaB = ratingDelta(resultB, paWinB, kB);
      const newTtrB = Math.round(ttrBSnapshot + deltaB);

      matchRows.push({
        playerId: stateB.id,
        matchDate: match.isoDate,
        competition: match.competition,
        opponentName: playerByNameKey.get(match.a.playerNameKey)?.name ?? "",
        opponentPlayerId: stateA.id,
        opponentTtr: Math.round(ttrASnapshot),
        score: reverseScore(match.score),
        result: match.b.won ? "W" : "L",
        ttrDelta: Math.round(deltaB),
        newTtr: newTtrB,
      });
      stateB.ttr = newTtrB;
      stateB.careerMatches++;
      if (stateB.inactivityBonusRemaining > 0) stateB.inactivityBonusRemaining--;
      summary.matchesGraded++;
    }
  }

  return { matchRows, summary };
}
