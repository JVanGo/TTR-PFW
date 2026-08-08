/**
 * DTR "Klassierung" bands from DëschTennisRating.pdf (p.6-7) — replaces the old
 * FLTT letter classes (A1-D3) with the bands the DTR system itself defines,
 * derived purely from a player's current DTR value.
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
  "18",
  "N",
] as const;

export type Klassierung = (typeof KLASSIERUNG_BANDS)[number];

export function klassierungForDtr(dtr: number): Klassierung {
  if (dtr <= 975) return "9";
  if (dtr <= 1100) return "10";
  if (dtr <= 1200) return "11";
  if (dtr <= 1300) return "12";
  if (dtr <= 1400) return "13";
  if (dtr <= 1500) return "14";
  if (dtr <= 1600) return "15";
  if (dtr <= 1700) return "16";
  if (dtr <= 1800) return "17";
  if (dtr <= 1900) return "18";
  return "N";
}
