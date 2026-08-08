/**
 * Lineup Builder domain logic — Mannschaftsaufstellung / Spielstärke-Reihenfolge
 * rules from DëschTennisRating.pdf (p.5-6).
 *
 * The rule: in a listed order (top = strongest), a pair is a violation if the
 * later-listed player's DTR is more than the applicable tolerance HIGHER than
 * the earlier-listed player's. For a lineup built by sorting DTR descending
 * and only ever adjusted by swapping adjacent players, checking a pair's own
 * DTR gap against tolerance is sufficient to know whether swapping them is
 * legal — an adjacent swap can't create a violation anywhere except between
 * the swapped pair itself, since every other pair's relative order is
 * untouched.
 */

export interface LineupPlayer {
  id: string;
  name: string;
  dtr: number;
  /** True if the player has a non-null age_category (youth, per the PDF's Ersteinstufung categories). */
  isYouth: boolean;
  /** True if the player is on the Kader (kaderzusammensetzung-november-2025.pdf). */
  isKader: boolean;
}

export interface Team<T extends LineupPlayer = LineupPlayer> {
  players: T[];
}

/** Club-wide / team-internal tolerance in DTR points, per tier. */
export const TOLERANCE = {
  base: { team: 35, club: 50 },
  youth: { team: 70, club: 85 },
  kader: { team: 105, club: 120 },
} as const;

export type ToleranceTier = keyof typeof TOLERANCE;

/**
 * The PDF states each tier as an independent bump from the same base (50/35)
 * rather than stacking youth-then-Kader, so a pair takes the single most
 * generous tier either player qualifies for.
 */
export function toleranceTierFor(a: LineupPlayer, b: LineupPlayer): ToleranceTier {
  if (a.isKader || b.isKader) return "kader";
  if (a.isYouth || b.isYouth) return "youth";
  return "base";
}

export function toleranceFor(a: LineupPlayer, b: LineupPlayer, sameTeam: boolean): number {
  const tier = toleranceTierFor(a, b);
  return sameTeam ? TOLERANCE[tier].team : TOLERANCE[tier].club;
}

/** Whether two players — anywhere adjacent in the lineup — can legally swap places. */
export function canSwap(a: LineupPlayer, b: LineupPlayer, sameTeam: boolean): boolean {
  return Math.abs(a.dtr - b.dtr) <= toleranceFor(a, b, sameTeam);
}

/**
 * Sorts by DTR descending (ties broken by name for determinism) and chunks
 * into teams of 4, in order — Team 1 gets the top 4, Team 2 the next 4, etc.
 * Callers are expected to pass exactly `teamCount * 4` players; a short
 * final chunk (fewer than 4) is still returned as-is rather than dropped.
 */
export function buildTeams<T extends LineupPlayer>(players: T[], teamCount: number): Team<T>[] {
  const sorted = [...players].sort((x, y) => y.dtr - x.dtr || x.name.localeCompare(y.name));
  const teams: Team<T>[] = [];
  for (let i = 0; i < teamCount; i++) {
    teams.push({ players: sorted.slice(i * 4, i * 4 + 4) });
  }
  return teams;
}
