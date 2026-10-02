import type { PlayerClass } from "@/lib/conversions";

export interface SeasonStartOverride {
  flttPlayerId: string;
  name: string;
  club: string;
  class: PlayerClass;
  /**
   * An exact starting TTR, when the class-median stand-in (see below) isn't
   * right for this specific player — e.g. Jeff judging the division median
   * too low for where they're actually playing. Takes priority over the
   * median when present; the `class` field is still required even then, as
   * a record of what Jeff determined their real class to be.
   */
  ttr?: number;
}

/**
 * Manual corrections for players whose row in the season-start export
 * (see season-start-export.ts) had to be skipped because
 * `performancePfInitial` was the `0` "not tracked" placeholder, or whose
 * class on file is simply wrong (confirmed by Jeff against real play, not
 * an export gap — e.g. RASOULI Sadra, 2026-10-02: his matches record him as
 * C1, but Jeff confirmed his real level is B2; see `ttr` below for why a
 * flat number was needed on top of that). Reset to empty at each season
 * rollover — these are one-off fixes for that specific season's data, not
 * something that carries forward. (Last held 12 entries for 2025-2026,
 * confirmed by Jeff one at a time on 2026-08-07.)
 *
 * Takes priority over the export and the match-history heuristic — including
 * `earliestClass` (see ttr-simulation-io.ts), which otherwise wins out with
 * whatever wrong class the player's own match data carries, same as the
 * export would. Without a `ttr`, a player here has no starting PFW either,
 * so their starting TTR is the median PFW-regression estimate among today's
 * active players in that same class (see medianTtrByClass in
 * ttr-simulation-io.ts) — a "typical player in this class" stand-in, not a
 * precise number. RASOULI Sadra needed more than that: the B2 median (1383)
 * read as too low for his actual current strength, so Jeff pinned an exact
 * 1550 instead via `ttr`.
 */
export const SEASON_START_OVERRIDES: SeasonStartOverride[] = [
  { flttPlayerId: "28585", name: "RASOULI Sadra", club: "Schëffleng", class: "B2", ttr: 1550 },
];

export interface ReturningPlayerPfwOverride {
  flttPlayerId: string;
  name: string;
  club: string;
  /** Fresh PFW the federation assigned on the player's return — used directly via estimateTtr(), not a class-median stand-in. */
  pfw: number;
}

/**
 * Players the federation has manually reassessed with a fresh PFW after
 * returning from a long absence — confirmed by Jeff one at a time. The
 * fresh PFW is used as their season-start rating (checked right after a
 * real prior-season DTR carry-forward, ahead of every other source), and
 * their Inaktivitätsabzug (see DëschTennisRating.pdf) is treated as already
 * fully paid down rather than reapplied on top of an already-fresh number —
 * see how INACTIVITY_DEDUCTION_STAGE_3_TOTAL is used in
 * ttr-simulation-io.ts. Their real match history (career-match count, last
 * match date) is left untouched, so the newcomer/returning K-bonuses still
 * apply normally.
 */
export const RETURNING_PLAYER_PFW_OVERRIDES: ReturningPlayerPfwOverride[] = [
  { flttPlayerId: "21561", name: "HABEL Mirko", club: "Recken", pfw: 925.0 },
];
