/**
 * DTR "Klassierung" bands, adapted from DëschTennisRating.pdf (p.6-7),
 * derived purely from a player's current DTR value.
 *
 * Boundaries reworked from the PDF's own (976-1100, 1101-1200, ...,
 * 1801-1900, 1901+) onto round hundreds, per the site owner — D3/D2 too
 * since 2026-11-26 (D2 = 1000-1099; it had kept the PDF's 976-1100). Renamed
 * 2026-11-18 from the PDF's numbers (9-18+, N) to FLTT's own classement
 * names, one-for-one: 9 -> D3, 10 -> D2, 11 -> D1, 12 -> C3, 13 -> C2,
 * 14 -> C1, 15 -> B3, 16 -> B2, 17 -> B1, 18+ -> A3. The old open-ended N
 * (2000+) is split into A2 (2000-2399) and A1 (2400+) — 2400 is where
 * FLTT's own A1/A2 players separate in the live DTR data (25 of 26 players
 * at 2400+ were FLTT A1, only one FLTT A1 sat below it). Lowered to 2350
 * on 2026-11-27 by the site owner, to bring A1 closer to its ideal share.
 */
export const KLASSIERUNG_BANDS = [
  "D3",
  "D2",
  "D1",
  "C3",
  "C2",
  "C1",
  "B3",
  "B2",
  "B1",
  "A3",
  "A2",
  "A1",
] as const;

export type Klassierung = (typeof KLASSIERUNG_BANDS)[number];

export function klassierungForDtr(dtr: number): Klassierung {
  if (dtr <= 999) return "D3";
  if (dtr <= 1099) return "D2";
  if (dtr <= 1199) return "D1";
  if (dtr <= 1299) return "C3";
  if (dtr <= 1399) return "C2";
  if (dtr <= 1499) return "C1";
  if (dtr <= 1599) return "B3";
  if (dtr <= 1699) return "B2";
  if (dtr <= 1799) return "B1";
  if (dtr <= 1999) return "A3";
  if (dtr <= 2349) return "A2";
  return "A1";
}
