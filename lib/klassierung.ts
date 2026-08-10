/**
 * DTR "Klassierung" bands, adapted from DëschTennisRating.pdf (p.6-7) —
 * replaces the old FLTT letter classes (A1-D3) with bands the DTR system
 * itself defines, derived purely from a player's current DTR value.
 *
 * Reworked from the PDF's own boundaries (976-1100, 1101-1200, ...,
 * 1801-1900, 1901+) to round hundreds instead, per the site owner: classes 9
 * and 10 keep their original cutoffs, every band from 11 up shifts down by
 * one point so each spans a clean hundred (11 = 1100-1199, 12 = 1200-1299,
 * ...), 18 doubles in width to become the open-ended "18+" (1800-1999), and N
 * now starts at 2000 instead of 1901.
 */
export const KLASSIERUNG_BANDS = [
  "9",
  "10",
  "11",
  "12",
  "13",
  "14",
  "15",
  "16",
  "17",
  "18+",
  "N",
] as const;

export type Klassierung = (typeof KLASSIERUNG_BANDS)[number];

export function klassierungForDtr(dtr: number): Klassierung {
  if (dtr <= 975) return "9";
  if (dtr <= 1100) return "10";
  if (dtr <= 1199) return "11";
  if (dtr <= 1299) return "12";
  if (dtr <= 1399) return "13";
  if (dtr <= 1499) return "14";
  if (dtr <= 1599) return "15";
  if (dtr <= 1699) return "16";
  if (dtr <= 1799) return "17";
  if (dtr <= 1999) return "18+";
  return "N";
}
