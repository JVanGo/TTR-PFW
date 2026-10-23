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

/** A division heading line in the main document, e.g. "NL 2", "PROM - DIS 1", "DIV 3 - DIS 4". */
const DIVISION_HEADING = /^\s*(?:NL|PROM|DIV)\b/;
const ADJACENT_ONLY_DIVISION = /^\s*NL\s*[123]\s*$/;

/**
 * Only the lines of the main document listed under an "NL 1"–"NL 3"
 * heading. Each match day repeats every heading, and a page header
 * interrupting a section doesn't end it — only the next heading does.
 */
function adjacentOnlyDivisionText(mainText: string): string {
  let inside = false;
  const kept: string[] = [];
  for (const line of mainText.split("\n")) {
    if (DIVISION_HEADING.test(line)) {
      inside = ADJACENT_ONLY_DIVISION.test(line);
    } else if (inside) {
      kept.push(line);
    }
  }
  return kept.join("\n");
}

export interface TeamCountResult {
  /** club -> team count, for every club found in either document. */
  counts: Map<string, number>;
  /**
   * club -> how many of its teams play in NL1–NL3 (the top-tier document
   * counts as NL1), for every club in `counts` — 0 if none. Teams are
   * numbered strongest first, so these are always the club's first N.
   */
  adjacentOnlyCounts: Map<string, number>;
  /** clubs from the input list found in neither document. */
  unmatched: string[];
}

export function extractTeamCounts(
  clubs: string[],
  mainText: string,
  topTierText: string | null,
): TeamCountResult {
  const counts = new Map<string, number>();
  const adjacentOnlyCounts = new Map<string, number>();
  const unmatched: string[] = [];
  const adjacentOnlyText = adjacentOnlyDivisionText(mainText);

  for (const club of clubs) {
    const highestNumbered = highestNumberedTeam(club, mainText);
    const inTopTier = topTierText != null && appearsBare(club, topTierText);
    const count = Math.max(highestNumbered ?? 0, inTopTier ? 1 : 0);
    if (count > 0) {
      counts.set(club, count);
      adjacentOnlyCounts.set(
        club,
        Math.max(highestNumberedTeam(club, adjacentOnlyText) ?? 0, inTopTier ? 1 : 0),
      );
    } else {
      unmatched.push(club);
    }
  }

  return { counts, adjacentOnlyCounts, unmatched };
}
