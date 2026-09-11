/**
 * Youth age categories, ordered youngest to oldest (per the K-bonus brackets
 * in lib/import/ttr-simulation.ts: Poussin-Cadet are "under 15", Junior and
 * Espoirs are the older "under 21" bracket). A leaf module with no imports so
 * client components (e.g. the Lineup Builder) can use the ordering without
 * pulling in lib/import's server-only dependencies (xlsx, supabase-js).
 */
export const AGE_CATEGORIES = [
  "Poussin",
  "Benjamin",
  "Minime",
  "Cadet",
  "Junior",
  "Espoirs",
] as const;

export type AgeCategory = (typeof AGE_CATEGORIES)[number];
