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

// The PDF's own bonus labels give the resulting K directly: "+4 (20) Spieler
// unter 21 Jahre (Espoirs)" and "+8 (24) Spieler unter 15 Jahre (Cadets)" —
// these are NOT cumulative between brackets. A player in the u15 bracket
// gets +8 (K=24) on its own, not +4 stacked with +8 (K=28) — confirmed with
// the site owner. Poussin/Benjamin/Minime/Cadet fall under the u15 bracket;
// Junior/Espoirs fall under the (non-stacking) u21-only bracket.
const AGE_RULES: Record<AgeCategory, AgeRule> = {
  Poussin: { kBonus: 8, ersteinstufung: 850, youthGrowth: true },
  Benjamin: { kBonus: 8, ersteinstufung: 850, youthGrowth: true },
  Minime: { kBonus: 8, ersteinstufung: 900, youthGrowth: true },
  Cadet: { kBonus: 8, ersteinstufung: 900, youthGrowth: true },
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
  /** ISO dates the youth growth bonus lands on — one per Teilrunde end (the season's Aug 1 and Jan 1). */
  youthGrowthIsoDates: string[];
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
  /** The Änderungskonstante (K) applied to this match, or null for a tournament-placement bonus. */
  kFactor: number | null;
}

export interface SimulationSummary {
  matchesGraded: number;
  tournamentGamesExcluded: number;
  nonRatedGamesExcluded: number;
  placementBonusesApplied: number;
  youthGrowthBonusesApplied: number;
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
    });
  }

  const trackedNameKeys = new Set(playerByNameKey.keys());
  const summary: SimulationSummary = {
    matchesGraded: 0,
    tournamentGamesExcluded: 0,
    nonRatedGamesExcluded: 0,
    placementBonusesApplied: 0,
    youthGrowthBonusesApplied: 0,
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

  // A player only qualifies for the youth growth bonus if they actually
  // played a graded match this season — an eligible-age player who never
  // played at all shouldn't get an automatic rating bump either Teilrunde.
  const playedThisSeason = new Set<string>();
  for (const m of canonicalMatches) {
    playedThisSeason.add(m.a.playerNameKey);
    if (m.b.kind === "tracked") playedThisSeason.add(m.b.playerNameKey);
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
  const sortedGrowthDates = [...input.youthGrowthIsoDates].sort();

  const applyGrowthIfDue = (isoDate: string) => {
    for (const growthDate of sortedGrowthDates) {
      if (growthDatesApplied.has(growthDate) || isoDate < growthDate) continue;
      for (const [key, state] of states) {
        if (!ageRule(state.ageCategory).youthGrowth) continue;
        if (!playedThisSeason.has(key)) continue;
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
        });
        state.ttr = newTtr;
        summary.youthGrowthBonusesApplied++;
      }
      growthDatesApplied.add(growthDate);
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
    applyGrowthIfDue(dayIso);

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
      const kA = kFactor(stateA);
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
      });
      addDelta(match.a.playerNameKey, deltaA);
      addMatchPlayed(match.a.playerNameKey);
      summary.matchesGraded++;

      if (stateB && stateBKey) {
        const kB = kFactor(stateB);
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
    }

    for (const { settleKey, ...row } of dayRows) {
      matchRows.push({ ...row, newTtr: states.get(settleKey)?.ttr ?? row.newTtr });
    }
  }

  return { matchRows, summary };
}
