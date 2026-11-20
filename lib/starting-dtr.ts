export interface MatchForStartingDtr {
  match_date: string;
  competition: string;
  ttr_delta: number;
  new_ttr: number;
  /** Play order within a day (simulation rows saved since 2026-11-20 each get their own). */
  created_at?: string;
}

/**
 * True when every row has its own created_at, so sorting by it gives the
 * real play order. Rows saved before 2026-11-20 share one per insert batch.
 */
export function hasDistinctPlayOrder(rows: { created_at?: string }[]): boolean {
  const stamps = rows.map((r) => r.created_at);
  return stamps.every((s) => s != null) && new Set(stamps).size === stamps.length;
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
  if (hasDistinctPlayOrder(earliestDayRows)) {
    // A day can settle more than once (once per competition), so walk the
    // first settlement only: the leading rows sharing one new_ttr. Their
    // deltas add up to exactly how far that settlement moved the rating.
    const ordered = [...earliestDayRows].sort((a, b) => a.created_at!.localeCompare(b.created_at!));
    let firstRunSum = 0;
    for (const row of ordered) {
      if (row.new_ttr !== ordered[0].new_ttr) break;
      firstRunSum += row.ttr_delta;
    }
    return ordered[0].new_ttr - firstRunSum;
  }
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
