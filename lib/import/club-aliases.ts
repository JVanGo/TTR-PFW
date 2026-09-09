/**
 * Known club renames/mergers where FLTT's historical match data still shows
 * the old name(s). Applied when deriving a player's current club from an R2
 * opponent-club sighting (see fetchCatalogFromR2 in r2-player-history.ts),
 * so a player who simply hasn't played — as anyone's tracked opponent — since
 * the change doesn't get stuck showing a now-defunct club name just because
 * their only sighting predates it.
 *
 * - Bech and Bäerdref merged to form Mëllerdall from the 26/27 season
 *   onwards. Confirmed with Jeff on 2026-09-09, after the season sightings
 *   themselves showed the exact pattern expected of a mid-year merger: every
 *   "Bech"/"Bäerdref" sighting was from season 25-26, every "Mëllerdall"
 *   sighting from 26-27, with no overlap either way.
 */
export const CLUB_ALIASES: Record<string, string> = {
  Bech: "Mëllerdall",
  Bäerdref: "Mëllerdall",
};

export function resolveClubAlias(club: string): string {
  return CLUB_ALIASES[club] ?? club;
}
