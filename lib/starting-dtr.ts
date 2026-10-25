export interface MatchForStartingDtr {
  match_date: string;
  competition: string;
  ttr_delta: number;
  new_ttr: number;
}

/**
 * The DTR a player began the season with, before any of this season's
 * matches changed it. `matches` is sorted earliest-first, so the player's
 * first calendar day of activity settles to their true starting number plus
 * that day's total change — working backwards from it recovers the exact
 * starting value the season simulation actually used, rather than
 * re-guessing it. The youth growth bonus and Ersteinstufung floor-reset both
 * apply immediately (not batched with that day's other results), so if the
 * first day has a real match or placement too, that row's settled total is
 * preferred over either synthetic row's intermediate one.
 */
export function computeStartingDtr(matches: MatchForStartingDtr[]): number | null {
  if (matches.length === 0) return null;
  const earliestDate = matches[0].match_date;
  const earliestDayRows = matches.filter((m) => m.match_date === earliestDate);
  const settledRow =
    earliestDayRows.find(
      (m) =>
        m.competition !== "Nachwuchs-Spielstärkezuwachs" &&
        m.competition !== "Ersteinstufung-Mindestwert" &&
        m.competition !== "Inaktivitätsabzug",
    ) ?? earliestDayRows[0];
  const daySum = earliestDayRows.reduce((sum, m) => sum + m.ttr_delta, 0);
  return settledRow.new_ttr - daySum;
}
