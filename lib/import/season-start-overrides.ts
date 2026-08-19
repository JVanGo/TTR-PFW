import type { PlayerClass } from "@/lib/conversions";

export interface SeasonStartOverride {
  flttPlayerId: string;
  name: string;
  club: string;
  class: PlayerClass;
}

/**
 * Manual corrections for players whose row in the season-start export
 * (see season-start-export.ts) had to be skipped because
 * `performancePfInitial` was the `0` "not tracked" placeholder. All 12 are
 * brand-new registrations this season with no real PFW to run the A1-B3
 * regression on — Jeff confirmed each one's actual starting class directly,
 * one at a time, on 2026-08-07.
 *
 * Takes priority over the export and the match-history heuristic. Since
 * there's still no starting PFW for any of them, their starting TTR is the
 * median PFW-regression estimate among today's active players in that same
 * class (see medianTtrByClass in ttr-simulation-io.ts) — a "typical player
 * in this class" stand-in, not a precise number.
 */
export const SEASON_START_OVERRIDES: SeasonStartOverride[] = [
  { flttPlayerId: "28045", name: "KINTZINGER Alexandre", club: "Mondorf", class: "B2" },
  { flttPlayerId: "21881", name: "BAVAY Olivier", club: "Wolz", class: "A3" },
  { flttPlayerId: "28076", name: "ARABA Florian", club: "Nidderkäerjeng", class: "B1" },
  { flttPlayerId: "28047", name: "JADOT Pierre-Julien", club: "Recken", class: "B1" },
  { flttPlayerId: "28012", name: "COLLARD Cédric", club: "Ëlwen", class: "B1" },
  { flttPlayerId: "12219", name: "CRELO Pol", club: "Mäertert", class: "B2" },
  { flttPlayerId: "28080", name: "FONCK Kévin", club: "Hueschtert-F.", class: "B1" },
  { flttPlayerId: "28039", name: "MATHIEU Joshua", club: "Kordall", class: "B2" },
  { flttPlayerId: "28030", name: "PALLAGE Frank", club: "Kordall", class: "B2" },
  { flttPlayerId: "28014", name: "CLÉMENT Perrine", club: "Ëlwen", class: "B2" },
  { flttPlayerId: "28077", name: "ARABA David", club: "Nidderkäerjeng", class: "B3" },
  { flttPlayerId: "28074", name: "VAZ Noah", club: "Nidderkäerjeng", class: "B1" },
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
