import type { AgeCategory } from "@/lib/age-categories";

/**
 * The DTR formula itself (DëschTennisRating.pdf): win probability, the
 * per-game change, and the K factor. A leaf module with no imports beyond a
 * type, so both the season simulation (lib/import/ttr-simulation.ts) and the
 * browser-side DTR-Rechner use the exact same maths.
 */

export const BASE_K = 16;
export const CAREER_MATCH_THRESHOLD = 30;
export const CAREER_MATCH_BONUS = 4;
export const INACTIVITY_BONUS = 4;
export const INACTIVITY_BONUS_MATCHES = 15;

// The PDF's own bonus labels give the resulting K directly: "+4 (20) Spieler
// unter 21 Jahre (Espoirs)" and "+8 (24) Spieler unter 15 Jahre (Cadets)" —
// these are NOT cumulative between brackets. A player in the u15 bracket
// gets +8 (K=24) on its own, not +4 stacked with +8 (K=28) — confirmed with
// the site owner. Poussin/Benjamin/Minime/Cadet fall under the u15 bracket;
// Junior/Espoirs fall under the (non-stacking) u21-only bracket.
const AGE_K_BONUS: Record<AgeCategory, number> = {
  Poussin: 8,
  Benjamin: 8,
  Minime: 8,
  Cadet: 8,
  Junior: 4,
  Espoirs: 4,
};

export function ageKBonus(category: AgeCategory | null): number {
  return category ? AGE_K_BONUS[category] : 0;
}

/** Win probability for a player rated `ttrSelf` against `ttrOpponent`. */
export function winProbability(ttrSelf: number, ttrOpponent: number): number {
  return 1 / (1 + Math.pow(10, (ttrOpponent - ttrSelf) / 150));
}

/** TTR change for a single player: (result - expected) * K. */
export function ratingDelta(result: 0 | 1, winProb: number, k: number): number {
  return (result - winProb) * k;
}

export interface KFactorInput {
  ageCategory: AgeCategory | null;
  /** Rated games played before this one, across the player's whole FLTT career. */
  careerMatches: number;
  /** Games left with the +4 returning-player bonus (15 after a 12+ month break). */
  returningGamesLeft: number;
}

export interface KFactorBreakdown {
  k: number;
  ageBonus: number;
  isNewcomerBonus: boolean;
  isReturningBonus: boolean;
}

export function kFactorFor({
  ageCategory,
  careerMatches,
  returningGamesLeft,
}: KFactorInput): KFactorBreakdown {
  const ageBonus = ageKBonus(ageCategory);
  const isNewcomerBonus = careerMatches < CAREER_MATCH_THRESHOLD;
  const isReturningBonus = returningGamesLeft > 0;
  let k = BASE_K + ageBonus;
  if (isNewcomerBonus) k += CAREER_MATCH_BONUS;
  if (isReturningBonus) k += INACTIVITY_BONUS;
  return { k, ageBonus, isNewcomerBonus, isReturningBonus };
}

export interface CalculatorSide {
  dtr: number;
  k: number;
}

export interface CalculatorGame {
  opponent: CalculatorSide;
  won: boolean;
}

export interface CalculatedGame {
  winProbability: number;
  /** Your change for this game, before rounding: (result − P) × K. */
  exactDelta: number;
  delta: number;
  /** The opponent's change for this one game (their own K, their own perspective). */
  opponentDelta: number;
  opponentNewDtr: number;
}

export interface CalculatedMatchday {
  games: CalculatedGame[];
  totalDelta: number;
  newDtr: number;
}

/**
 * One matchday, settled the way the season simulation settles it: every
 * game uses the ratings from the start of the day, each game's change is
 * rounded on its own, and the changes are added up once at the end. A single
 * game is just a matchday with one entry.
 */
export function calculateMatchday(
  self: CalculatorSide,
  games: CalculatorGame[],
): CalculatedMatchday {
  const calculated = games.map(({ opponent, won }) => {
    const p = winProbability(self.dtr, opponent.dtr);
    const exactDelta = ratingDelta(won ? 1 : 0, p, self.k);
    const opponentDelta = Math.round(ratingDelta(won ? 0 : 1, 1 - p, opponent.k));
    return {
      winProbability: p,
      exactDelta,
      delta: Math.round(exactDelta),
      opponentDelta,
      opponentNewDtr: opponent.dtr + opponentDelta,
    };
  });
  const totalDelta = calculated.reduce((sum, g) => sum + g.delta, 0);
  return { games: calculated, totalDelta, newDtr: self.dtr + totalDelta };
}
