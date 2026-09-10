/**
 * "2026-2027" -> "2025-2026" — the full-form season label immediately
 * before `current`. Kept dependency-free (unlike ttr-simulation-io.ts,
 * which pulls in R2/AWS SDK access) so lib/ranking.ts — on the hot path for
 * every page load — can use it without dragging that in too. Same reason
 * identityKey/clubKey live in their own file instead of ttr-simulation-io.ts.
 */
export function previousSeasonLabel(current: string): string {
  const [startYear, endYear] = current.split("-").map(Number);
  return `${startYear - 1}-${endYear - 1}`;
}
