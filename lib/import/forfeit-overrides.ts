export interface ForfeitOverride {
  flttPlayerId: string;
  name: string;
  half: number;
  round: number;
  team: string;
  note: string;
}

/**
 * Manual corrections for a Forfaits.xlsx entry whose matched game(s) can't be
 * told apart from the data alone — normally `matchForfeits` only auto-applies
 * a forfeit to a board scored exactly "0-3" and flags anything else for
 * review, but these are cases Jeff has personally checked and decided how to
 * resolve. Bypasses that score check entirely: every candidate row matched
 * for this player+half+round+team is treated as forfeited (zero rating
 * points, marked "FF"), regardless of its recorded score.
 */
export const FORFEIT_OVERRIDES: ForfeitOverride[] = [
  {
    flttPlayerId: "24591",
    name: "RAGNACCI Tun",
    half: 2,
    round: 9,
    team: "Lénger 2",
    note:
      "Lénger 2 vs Union 1, 2026-04-25 — both of his boards that day (vs LAIR Sandro and vs " +
      'ROUKOZ Paul) are recorded identically as "0-0", one real and one unfinished, but which ' +
      "is which isn't recoverable from the data. Jeff's call on 2026-08-12: simplify by treating " +
      "both as FF rather than guess.",
  },
];
