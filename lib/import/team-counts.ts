/**
 * How many teams a club has entered in a competition, derived from FLTT's
 * published schedule PDFs (Spielplan). Two document shapes:
 *
 * - A "main" document listing every division below the top tier, where each
 *   team is written as `Clubname N` (e.g. "Bartreng 2" ... "Bartreng 10") —
 *   a club's count there is just the highest N found for them.
 * - An optional "top tier" document (e.g. National TT League) where only the
 *   single strongest team per club plays, written WITHOUT a number (just
 *   "Bartreng") — presence there counts as an implicit team 1, since the
 *   main document's numbering for a club with a top-tier team starts at 2
 *   (confirmed against real 2026-2027 data: Bartreng appears bare in the
 *   top-tier document and as "Bartreng 2".."Bartreng 10" in the main one,
 *   i.e. 10 teams total, with no "Bartreng 1" in the main document).
 *
 * Matching is exact-string against this app's own `players.club` spelling —
 * a club spelled differently across FLTT's own documents (e.g. the main
 * document abbreviates "Hueschtert-Folscht" as "Hueschtert-F.", while the
 * top-tier one spells it in full) will not resolve to the same club. This is
 * a known, accepted limitation for v1: callers should surface every known
 * club's match/no-match status so a mismatch is visible, not silent.
 */

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Unicode-aware "not part of a longer word" boundary — plain `\b` doesn't bound accented names correctly. */
function boundaryPattern(name: string): RegExp {
  return new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(name)}(?![\\p{L}\\p{N}])`, "u");
}

function highestNumberedTeam(club: string, text: string): number | null {
  const pattern = new RegExp(
    `(?<![\\p{L}\\p{N}])${escapeRegExp(club)}[ \\t]+(\\d{1,2})(?![\\p{L}\\p{N}])`,
    "gu",
  );
  let highest: number | null = null;
  for (const match of text.matchAll(pattern)) {
    const n = Number(match[1]);
    if (highest == null || n > highest) highest = n;
  }
  return highest;
}

function appearsBare(club: string, text: string): boolean {
  return boundaryPattern(club).test(text);
}

export interface TeamCountResult {
  /** club -> team count, for every club found in either document. */
  counts: Map<string, number>;
  /** clubs from the input list found in neither document. */
  unmatched: string[];
}

export function extractTeamCounts(
  clubs: string[],
  mainText: string,
  topTierText: string | null,
): TeamCountResult {
  const counts = new Map<string, number>();
  const unmatched: string[] = [];

  for (const club of clubs) {
    const highestNumbered = highestNumberedTeam(club, mainText);
    const inTopTier = topTierText != null && appearsBare(club, topTierText);
    const count = Math.max(highestNumbered ?? 0, inTopTier ? 1 : 0);
    if (count > 0) {
      counts.set(club, count);
    } else {
      unmatched.push(club);
    }
  }

  return { counts, unmatched };
}
