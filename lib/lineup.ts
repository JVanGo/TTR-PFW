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
 * DTR 100, 70, 100, 125 has every adjacent gap within a 40-point tolerance,
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
  /** The player's raw age category, or null for an adult. Used for competition age-eligibility, not for tolerance tiers. */
  ageCategory: AgeCategory | null;
  /**
   * The player's DTR on the Verbandsrangliste frozen at the start of the
   * current Teilrunde (1 Aug / 1 Jan), or null if they weren't on it. Only
   * the adjacent-only (NL) teams use it — see startingOrder.
   */
  snapshotDtr?: number | null;
}

export interface Team<T extends LineupPlayer = LineupPlayer> {
  players: T[];
}

/**
 * Allowed DTR gap in points, per tier — the same within a team and across
 * teams. The PDF's separate team (35/70) and club (50/85) limits let a
 * player be blocked from the last spots of their own team yet allowed into
 * the next team's top spot, since moving down a team swapped in the looser
 * limit for the very same pair (Zéisseng's BERNARDIN Luc, 2026-10-28). One
 * limit per tier avoids that (Jeff's call).
 */
export const TOLERANCE = { base: 40, youth: 75 } as const;

export type ToleranceTier = keyof typeof TOLERANCE;

/**
 * A pair takes the youth tier if either player qualifies. The PDF also
 * describes a wider Kader tier (105/120); it's deliberately not applied here
 * (Jeff's call, 2026-10-20).
 */
export function toleranceTierFor(a: LineupPlayer, b: LineupPlayer): ToleranceTier {
  if (a.isYouth || b.isYouth) return "youth";
  return "base";
}

export function toleranceFor(a: LineupPlayer, b: LineupPlayer): number {
  return TOLERANCE[toleranceTierFor(a, b)];
}

/**
 * Whether the arrangement (index order = listed order) satisfies the
 * tolerance rule for every pair, not just neighbors. Team boundaries don't
 * matter: the limit is the same within and across teams.
 */
export function isValidArrangement(players: LineupPlayer[]): boolean {
  for (let i = 0; i < players.length; i++) {
    for (let j = i + 1; j < players.length; j++) {
      if (players[j].dtr - players[i].dtr > toleranceFor(players[i], players[j])) return false;
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

function sortByDtr<T extends LineupPlayer>(players: T[]): T[] {
  return [...players].sort((x, y) => y.dtr - x.dtr || x.name.localeCompare(y.name));
}

function adjacentOnlySlotCount(teamSizes: number[], adjacentOnlyTeams: number): number {
  return teamSizes.slice(0, adjacentOnlyTeams).reduce((a, b) => a + b, 0);
}

/**
 * The lineup before any manual move. Without adjacent-only teams that's
 * simply DTR order. With them, the adjacent-only (NL) spots go to the
 * players highest on the frozen Verbandsrangliste, in that order (a player
 * not on it counts with their current DTR); everyone else follows by
 * current DTR.
 */
export function startingOrder<T extends LineupPlayer>(
  players: T[],
  teamSizes: number[],
  adjacentOnlyTeams = 0,
): T[] {
  const slots = adjacentOnlySlotCount(teamSizes, adjacentOnlyTeams);
  if (slots === 0) return sortByDtr(players);
  const listed = (p: LineupPlayer) => p.snapshotDtr ?? p.dtr;
  const bySnapshot = [...players].sort(
    (x, y) => listed(y) - listed(x) || x.name.localeCompare(y.name),
  );
  return [...bySnapshot.slice(0, slots), ...sortByDtr(bySnapshot.slice(slots))];
}

/** Every index the player at `fromIndex` could move to with the pairwise rule alone still holding. */
function pairwiseTargets(players: LineupPlayer[], fromIndex: number): number[] {
  const legal: number[] = [];
  for (let to = 0; to < players.length; to++) {
    if (to === fromIndex) continue;
    if (isValidArrangement(movePlayer(players, fromIndex, to))) legal.push(to);
  }
  return legal;
}

/**
 * Each player's own range of allowed positions, fixed from the plain
 * DTR-sorted lineup: their sorted slot plus every slot they could move to
 * from there on their own. Without this, the pairwise rule alone lets one
 * player's tolerance leak into another's: moving a youth player to the top
 * (legal, thanks to the youth tolerance) puts an adult behind them, and from
 * that new spot the adult could slide further down than they ever could from
 * the sorted lineup — e.g. Beetebuerg-P's REKAWEK Radoslaw (1736) may only
 * drop to 3rd in Team 1, but after REKAWEK Jan (youth, 1675) moved above him,
 * he could reach 4th.
 */
function allowedSlotsById(players: LineupPlayer[]): Map<string, Set<number>> {
  const sorted = sortByDtr(players);
  const allowed = new Map<string, Set<number>>();
  sorted.forEach((p, i) => allowed.set(p.id, new Set([i, ...pairwiseTargets(sorted, i)])));
  return allowed;
}

/**
 * Every legal target under the DTR tolerance rule alone — see
 * legalTargetIndices. Allowed ranges come from `reference`'s own sorted
 * lineup; a player missing from it isn't range-checked.
 */
function toleranceTargets(
  players: LineupPlayer[],
  fromIndex: number,
  reference: LineupPlayer[] = players,
): number[] {
  const allowed = allowedSlotsById(reference);
  return pairwiseTargets(players, fromIndex).filter((to) =>
    movePlayer(players, fromIndex, to).every((p, i) => allowed.get(p.id)?.has(i) ?? true),
  );
}

/**
 * Every index (other than `fromIndex` itself) that the player at `fromIndex`
 * could legally move to — i.e. dropping them there, shifting everyone else
 * up or down by one, still satisfies isValidArrangement AND keeps every
 * player within their own allowed range (allowedSlotsById). Assumes
 * `players` is already valid before the move (true for anything this tool
 * produces: buildTeams's sorted output is always valid, and every accepted
 * move keeps it that way).
 *
 * The first `adjacentOnlyTeams` teams (a club's NL teams in Championnat
 * Seniors) follow a stricter rule instead, with no DTR tolerance at all: a
 * player there may only swap with the spot directly above or below — across
 * team boundaries too — and nobody may end up more than one spot away from
 * their place in startingOrder (the frozen Verbandsrangliste order), so
 * after #1 and #2 swap, the original #1 can't carry on down to #3. The
 * remaining teams keep the tolerance rule among themselves, on current DTR —
 * including after the last NL player swaps down into them.
 */
export function legalTargetIndices(
  players: LineupPlayer[],
  fromIndex: number,
  teamSizes: number[],
  adjacentOnlyTeams = 0,
): number[] {
  const adjacentOnlySlots = adjacentOnlySlotCount(teamSizes, adjacentOnlyTeams);
  if (adjacentOnlySlots === 0) return toleranceTargets(players, fromIndex);

  const starting = startingOrder(players, teamSizes, adjacentOnlyTeams);
  const startingSlot = new Map(starting.map((p, i) => [p.id, i]));
  const staysNearStartingSlot = (to: number) =>
    movePlayer(players, fromIndex, to).every((p, i) => {
      const start = startingSlot.get(p.id) ?? i;
      return (i >= adjacentOnlySlots && start >= adjacentOnlySlots) || Math.abs(i - start) <= 1;
    });
  const lowerTeamsStayValid = (to: number) =>
    isValidArrangement(movePlayer(players, fromIndex, to).slice(adjacentOnlySlots));

  const neighbors = [fromIndex - 1, fromIndex + 1].filter(
    (to) =>
      to >= 0 &&
      to < players.length &&
      Math.min(fromIndex, to) < adjacentOnlySlots &&
      staysNearStartingSlot(to) &&
      (Math.max(fromIndex, to) < adjacentOnlySlots || lowerTeamsStayValid(to)),
  );
  if (fromIndex < adjacentOnlySlots) return neighbors;

  const rest = toleranceTargets(
    players.slice(adjacentOnlySlots),
    fromIndex - adjacentOnlySlots,
    starting.slice(adjacentOnlySlots),
  )
    .map((to) => to + adjacentOnlySlots)
    .filter(staysNearStartingSlot);
  return [...neighbors, ...rest].sort((a, b) => a - b);
}

/**
 * Puts the players in startingOrder (plain DTR order, ties broken by name
 * for determinism, unless there are adjacent-only teams) and chunks them
 * into teams sized per `teamSizes`, in order — Team 1 gets the top
 * `teamSizes[0]`, Team 2 the next `teamSizes[1]`, etc. Callers are expected
 * to pass exactly `sum(teamSizes)` players; a short final chunk is still
 * returned as-is rather than dropped.
 */
export function buildTeams<T extends LineupPlayer>(
  players: T[],
  teamSizes: number[],
  adjacentOnlyTeams = 0,
): Team<T>[] {
  const sorted = startingOrder(players, teamSizes, adjacentOnlyTeams);
  const teams: Team<T>[] = [];
  let start = 0;
  for (const size of teamSizes) {
    teams.push({ players: sorted.slice(start, start + size) });
    start += size;
  }
  return teams;
}
