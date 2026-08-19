/** Normalizes a club name for comparison; null/blank all compare equal. */
export function clubKey(club: string | null): string {
  return (club ?? "").trim().toLowerCase();
}

/**
 * A player's identity: name key plus club, so two different real people who
 * happen to share a name (confirmed: ~25 cases in the FLTT catalog) don't
 * get merged together. Shared by the season simulation's Mongo/Supabase
 * matching (lib/import/ttr-simulation-io.ts) and anywhere else that needs to
 * match a manually-curated override (keyed by name + club) against a
 * Supabase `players` row, without pulling in the simulation's Mongo
 * dependency just for this.
 */
export function identityKey(playerNameKey: string, club: string | null): string {
  return `${playerNameKey}|${clubKey(club)}`;
}
