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

const ANCHORED_CLASSES: ReadonlySet<PlayerClass> = new Set(["D1", "D2", "D3"]);

/**
 * Convert a Luxembourg FLTT PFW score to an estimated German TTR rating.
 *
 * A1–C3 use the regression PFW ≈ 0.596 × TTR − 588 fit to 41 matched players.
 * D1–D3 use the same slope but anchored so the bottom-ranked D3 player ≈ TTR 700,
 * since the regression had no real data below TTR ~1200.
 */
export function estimateTtr(pfw: number, kl: PlayerClass): number {
  const offset = ANCHORED_CLASSES.has(kl) ? 355.17 : 587.68;
  return Math.round((pfw + offset) / 0.596);
}
