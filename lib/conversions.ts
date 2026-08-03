export const PLAYER_CLASSES = [
  "A1",
  "A2",
  "A3",
  "B1",
  "B2",
  "B3",
  "C1",
  "C2",
  "C3",
  "D1",
  "D2",
  "D3",
] as const;

export type PlayerClass = (typeof PLAYER_CLASSES)[number];

export function isPlayerClass(value: unknown): value is PlayerClass {
  return typeof value === "string" && (PLAYER_CLASSES as readonly string[]).includes(value);
}

// Regression PFW ≈ 0.596 × TTR − 587.68, fit to 41 matched players (all TTR ≳ 1200).
// Only used for A1-B3 — the regression has no real data below that.
const REGRESSION_SLOPE = 0.596;
const REGRESSION_OFFSET = 587.68;

// C1-D3 are estimated from classement points instead (see estimateTtrFromClassement).
const CLASSEMENT_LEVEL: Partial<Record<PlayerClass, number>> = {
  D3: 0,
  D2: 1,
  D1: 2,
  C3: 3,
  C2: 4,
  C1: 5,
};

// Each classement spans 17 points: -5,5 (about to drop a classement) to +11,5
// (about to be promoted). Stacking all six levels end to end gives one continuous
// scale, anchored so C1's top (+11,5) is 1345 TTR and D3's 0 points is 800 TTR.
const CLASSEMENT_SPAN = 17;
const CLASSEMENT_TOP_TTR = 1345;
const CLASSEMENT_ZERO_TTR = 800;
const CLASSEMENT_TOP_SCORE = 11.5 + CLASSEMENT_SPAN * CLASSEMENT_LEVEL.C1!;
const CLASSEMENT_SCALE = (CLASSEMENT_TOP_TTR - CLASSEMENT_ZERO_TTR) / CLASSEMENT_TOP_SCORE;

function estimateTtrFromClassement(kl: PlayerClass, points: number): number {
  const level = CLASSEMENT_LEVEL[kl]!;
  const score = points + CLASSEMENT_SPAN * level;
  return Math.round(CLASSEMENT_ZERO_TTR + score * CLASSEMENT_SCALE);
}

/**
 * Convert a Luxembourg FLTT player's rating to an estimated German TTR rating.
 *
 * A1-B3 use the PFW regression fit to 41 matched players. C1-D3 use the
 * player's classement points instead (see estimateTtrFromClassement) — the
 * regression has no real data down there, and PFW-based estimates weren't
 * reliable. Returns null for C1-D3 players whose classement points haven't
 * been entered yet.
 */
export function estimateTtr(
  pfw: number,
  kl: PlayerClass,
  classementPoints: number | null,
): number | null {
  if (kl in CLASSEMENT_LEVEL) {
    return classementPoints == null ? null : estimateTtrFromClassement(kl, classementPoints);
  }
  return Math.round((pfw + REGRESSION_OFFSET) / REGRESSION_SLOPE);
}
