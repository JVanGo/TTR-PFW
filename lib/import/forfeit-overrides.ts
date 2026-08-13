export interface ForfeitOverride {
  flttPlayerId: string;
  name: string;
  half: number;
  round: number;
  team: string;
  /** When set, only candidates on this exact date are treated as forfeited —
   * for a competition whose "round" number isn't unique across the season
   * (see the NL1 note below), so player+half+round+team alone still matches
   * more than one real tie. Omit when round+half+team already narrows to a
   * single date on their own. */
  isoDate?: string;
  note: string;
}

/**
 * Manual corrections for a Forfaits.xlsx entry whose matched game(s) still
 * can't be told apart from the data alone even after `matchForfeits`'s
 * automatic "0-3" and "0-0" forfeit-score checks (see its own doc comment) —
 * for whatever's left over, cases Jeff has personally checked and decided how
 * to resolve. Every candidate matched for this player+half+round+team (and
 * `isoDate`, when given) is treated as forfeited (zero rating points, marked
 * "FF"), regardless of its recorded score.
 */
export const FORFEIT_OVERRIDES: ForfeitOverride[] = [
  {
    flttPlayerId: "27551",
    name: "SWARTENBROUCKX Gaetan",
    half: 2,
    round: 2,
    team: "Lëntgen 1",
    isoDate: "2026-01-24",
    note:
      "Top-division NL1 doesn't number rounds the same way club leagues do — round+half+team " +
      "alone matched three different ties this season (2026-01-24 vs Hueschtert-F. 1 away, " +
      "2026-03-15 vs Lénger 1, 2026-04-26 vs Hueschtert-F. 1 home), all confusingly labeled " +
      '"round 2". Jeff confirmed on 2026-08-13 the real forfeit is the first one, 2026-01-24 — ' +
      "the other two are real matches (one a win, one a close loss).",
  },
];
