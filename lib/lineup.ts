/**
 * Lineup Builder domain logic — Mannschaftsaufstellung / Spielstärke-Reihenfolge
 * rules from DëschTennisRating.pdf (p.5-6).
 *
 * The rule: in a listed order (top = strongest), a pair is a violation if the
 * later-listed player's DTR is more than the applicable tolerance HIGHER than
 * the earlier-listed player's — and this applies to EVERY pair in the list,
 * not just neighbors. A single adjacent swap starting from a fully
 * DTR-sorted list can only ever create a new violation between the swapped
 * pair itself, but that stops being true once several swaps compound: e.g.
 * DTR 100, 70, 100, 125 has every adjacent gap within a 35-point tolerance,
 * yet position 2 (70) and position 4 (125) violate it by 55. So arrangements
 * are validated pairwise across the whole list (isValidArrangement), not
 * just neighbor-by-neighbor.
 */

import type { AgeCategory } from "@/lib/age-categories";

export interface LineupPlayer {
  id: string;
  name: string;
  dtr: number;
  /** True if the player has a non-null age_category (youth, per the PDF's Ersteinstufung categories). */
  isYouth: boolean;
  /** True if the player is on the Kader (kaderzusammensetzung-november-2025.pdf). */
  isKader: boolean;
  /** The player's raw age category, or null for an adult. Used for competition age-eligibility, not for tolerance tiers. */
  ageCategory: AgeCategory | null;
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

/**
 * Which team (0-indexed) a position falls into, given each team's size in
 * order — e.g. teamSizes [4, 4, 3] puts positions 0-3 in team 0, 4-7 in
 * team 1, 8-10 in team 2. Lets a competition's last team be a different
 * size than the rest (e.g. a club's Division 6 team is 3-man while the
 * rest of Championnat Seniors is 4-man).
 */
function teamIndexAt(position: number, teamSizes: number[]): number {
  let cumulative = 0;
  for (let team = 0; team < teamSizes.length; team++) {
    cumulative += teamSizes[team];
    if (position < cumulative) return team;
  }
  return teamSizes.length;
}

/**
 * Whether the arrangement (index order = listed order, chunked into teams
 * per `teamSizes`) satisfies the tolerance rule for every pair, not just
 * neighbors.
 */
export function isValidArrangement(players: LineupPlayer[], teamSizes: number[]): boolean {
  for (let i = 0; i < players.length; i++) {
    for (let j = i + 1; j < players.length; j++) {
      const sameTeam = teamIndexAt(i, teamSizes) === teamIndexAt(j, teamSizes);
      const tolerance = toleranceFor(players[i], players[j], sameTeam);
      if (players[j].dtr - players[i].dtr > tolerance) return false;
    }
  }
  return true;
}

/** Moves the item at `from` to index `to`, shifting the rest — a plain array move, no mutation. */
export function movePlayer<T>(list: T[], from: number, to: number): T[] {
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

/**
 * Every index (other than `fromIndex` itself) that the player at `fromIndex`
 * could legally move to — i.e. dropping them there, shifting everyone else
 * up or down by one, still satisfies isValidArrangement. Assumes `players`
 * is already valid before the move (true for anything this tool produces:
 * buildTeams's sorted output is always valid, and every accepted move keeps
 * it that way).
 */
export function legalTargetIndices(
  players: LineupPlayer[],
  fromIndex: number,
  teamSizes: number[],
): number[] {
  const legal: number[] = [];
  for (let to = 0; to < players.length; to++) {
    if (to === fromIndex) continue;
    if (isValidArrangement(movePlayer(players, fromIndex, to), teamSizes)) legal.push(to);
  }
  return legal;
}

/**
 * Sorts by DTR descending (ties broken by name for determinism) and chunks
 * into teams sized per `teamSizes`, in order — Team 1 gets the top
 * `teamSizes[0]`, Team 2 the next `teamSizes[1]`, etc. Callers are expected
 * to pass exactly `sum(teamSizes)` players; a short final chunk is still
 * returned as-is rather than dropped.
 */
export function buildTeams<T extends LineupPlayer>(players: T[], teamSizes: number[]): Team<T>[] {
  const sorted = [...players].sort((x, y) => y.dtr - x.dtr || x.name.localeCompare(y.name));
  const teams: Team<T>[] = [];
  let start = 0;
  for (const size of teamSizes) {
    teams.push({ players: sorted.slice(start, start + size) });
    start += size;
  }
  return teams;
}
