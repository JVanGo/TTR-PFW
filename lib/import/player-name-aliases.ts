/**
 * Players FLTT has renamed under the same licence, keyed by the old name.
 * Only the player's own R2 file switches to the new name — every opponent's
 * file keeps listing the old one, for past seasons AND for matches played
 * after the rename (confirmed 2026-10-23: licence 22467 became "MEYERS
 * Myriam" in her own file, while 271 opponents' files still said "THOMMES
 * Myriam", including September 2026 matches). Without this, renaming our
 * player row to the new name leaves every opponent-side row pointing at a
 * name no player has any more.
 *
 * Our `players` row carries the new name; the season simulation also resolves
 * the old name to it (see computeSeasonSimulation in ttr-simulation-io.ts).
 */
export const PLAYER_NAME_ALIASES: Record<string, string> = {
  "THOMMES Myriam": "MEYERS Myriam", // licence 22467, merged 2026-10-23
};
