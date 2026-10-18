import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import * as XLSX from "xlsx";
import type { ForfeitOverride } from "@/lib/import/forfeit-overrides";
import { nameKey } from "@/lib/name-key";
import { isNonRatedCompetition, isTournamentCompetition } from "@/lib/import/ttr-simulation";

// FLTT can produce a list of every forfeited game in a season (one row per
// forfeiting player: which team tie, which player, no date or opponent name).
// Gitignored/local-only (see TTR/ in the repo layout); update this filename
// each season a fresher export is provided.
export const FORFEITS_PATH = path.join(process.cwd(), "TTR", "Forfaits.xlsx");

const FORFEIT_SHEETS = ["FF", "FFp"] as const;

export interface ForfeitEntry {
  flttPlayerId: string;
  /** The leading family-letter code off SpT, e.g. "S", "C", "MIN" — see FAMILY_COMPETITION_KEYWORD. */
  family: string;
  /** The "(R{half})" half-season number embedded in the match's `competition` string. */
  half: number;
  /** Matches `rencontres.round` on the player's own Mongo match rows exactly. */
  round: number;
  /** The forfeiting player's own team ("Equipe"), a substring of `rencontres.matchLabel`. */
  team: string;
  /** For review-log lines, e.g. "CASTANO COPOT Tomas (FF, S-1.2/XC-0209)". */
  sourceLabel: string;
}

/** "S-2.8" -> { family: "S", half: 2, round: 8 }. */
export function parseSpT(spt: string): { family: string; half: number; round: number } | null {
  const m = spt.trim().match(/^([A-Za-z]+)-(\d+)\.(\d+)$/);
  if (!m) return null;
  return { family: m[1], half: Number(m[2]), round: Number(m[3]) };
}

/**
 * Maps a Forfaits.xlsx SpT family-letter code to a keyword its `competition`
 * string must contain in Mongo — e.g. family "C" means "CAD" (Cadets), not
 * "MIN" (Minimes), even though both can share the same round number and
 * "(Rx)" half tag. Without this, a player who plays multiple age-category
 * leagues for the same team number (common — confirmed for real with BONNE
 * RAAD Timothée, "Stroossen 2" in both CH CAD and CH MIN) can have
 * round+half+team match an entirely unrelated tie in a different league,
 * contaminating the candidate set with false positives.
 *
 * A substring match, not a "CH X" prefix match: the same age category can
 * show up under more than one competition label — "CH CAD" (the regular
 * league) and "M•supp CAD" (supplementary/makeup Cadets matches) are both
 * legitimately family "C" (confirmed for real with CHOURIS Hector, forfeited
 * in an "M•supp CAD" tie — an over-strict "CH CAD"-only prefix match wrongly
 * excluded his own real forfeit as "no matching game found"). Deliberately
 * broad rather than narrow: this filter's only job is keeping different age
 * categories apart, not distinguishing league-vs-cup formats within one.
 *
 * Confirmed against a real sample of this season's competition names; "N"
 * has no confirmed mapping yet (only 2 known FF/FFp rows use it) — entries
 * with an unmapped family fall back to matching on round+half+team alone,
 * same as before this fix.
 */
const FAMILY_COMPETITION_KEYWORD: Record<string, string> = {
  S: "SEN",
  C: "CAD",
  MIN: "MIN",
  JEU: "JEU",
  D: "DAM",
  KC: "KC",
};

interface RawForfeitRow {
  SpT?: unknown;
  MatchNr?: unknown;
  Equipe?: unknown;
  NOM?: unknown;
  Prenom?: unknown;
  Lic?: unknown;
}

export function parseForfeits(buffer: ArrayBuffer | Buffer): ForfeitEntry[] {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const out: ForfeitEntry[] = [];

  for (const sheetName of FORFEIT_SHEETS) {
    const sheet = wb.Sheets[sheetName];
    if (!sheet) continue;
    const rows = XLSX.utils.sheet_to_json<RawForfeitRow>(sheet, { defval: "" });

    for (const row of rows) {
      const lic = row.Lic;
      if (lic == null || lic === "") continue;
      const flttPlayerId = String(lic).trim();
      if (!flttPlayerId) continue;

      const spT = typeof row.SpT === "string" ? row.SpT : String(row.SpT ?? "");
      const decoded = parseSpT(spT);
      if (!decoded) continue;

      const team = typeof row.Equipe === "string" ? row.Equipe.trim() : "";
      if (!team) continue;

      const nom = typeof row.NOM === "string" ? row.NOM : "";
      const prenom = typeof row.Prenom === "string" ? row.Prenom : "";
      const matchNr = typeof row.MatchNr === "string" ? row.MatchNr : String(row.MatchNr ?? "");

      out.push({
        flttPlayerId,
        family: decoded.family,
        half: decoded.half,
        round: decoded.round,
        team,
        sourceLabel: `${nom} ${prenom} (${sheetName}, ${spT}/${matchNr})`.trim(),
      });
    }
  }

  return out;
}

/** Reads and parses the export from disk, or [] if no file is present there. */
export function readForfeitsFile(filePath: string = FORFEITS_PATH): ForfeitEntry[] {
  if (!existsSync(filePath)) return [];
  return parseForfeits(readFileSync(filePath));
}

/** A plain, Mongo-shape-independent view of one of a player's own season match
 * rows — just enough for `matchForfeits` to work with. */
export interface MatchCandidateRow {
  id: string;
  flttPlayerId: string;
  round: number | null;
  /** Already resolved (top-level `competition` with the `rencontres.competition` fallback applied). */
  competition: string;
  matchLabel: string | null;
  score: string | null;
  isoDate: string;
  opponentName: string;
  /** True when FLTT's own source data privately flags this exact row as a
   * forfeit (a `"forfeit":true` marker buried in the raw Rencontres cell,
   * only ever present on the forfeiting player's own row) — see
   * `findMarkerOnlyForfeits` below for why this exists as a second,
   * independent detection path alongside Forfaits.xlsx. */
  hasForfeitMarker: boolean;
}

export interface ForfeitMatchResult {
  forfeitedRowIds: Set<string>;
  reviewLines: string[];
}

/**
 * Matches each Forfaits.xlsx entry to the forfeiting player's own season match
 * row(s) for that team tie (round+half+team — see parseSpT's comment for why
 * the family-letter code isn't needed), then only actually treats it as a
 * confirmed forfeit for any matched row scored "0-3" or "0-0" — both
 * confirmed reliable signatures, but only trusted within an entry that
 * Forfaits.xlsx already names as a forfeit; a bare "0-0" is NOT a safe
 * forfeit signal on its own anywhere else in the season, since it's also
 * FLTT's legitimate score for two players on opposing sides BOTH forfeiting
 * the same board (Jeff, 2026-08-13). Within a named entry though, "0-0" reads
 * as *this* player's forfeit having been mis-entered instead of the usual
 * "0-3" — confirmed for real with RAGNACCI Tun and CONG Zhaoping, both
 * regular single-sided forfeits recorded as "0-0" by mistake — and either
 * way (a real mutual double-forfeit or a mis-entered single one) the correct
 * rating outcome is the same: zero for both sides.
 *
 * Judged per row, not as an all-or-nothing group: a player can forfeit just
 * one board of a multi-board tie while playing the others for real
 * (confirmed with Jeff on 2026-08-12 — OMS Mara played and lost her first
 * board 1-3, then forfeited her second, 0-3; only the second should move
 * zero points). Candidates spanning more than one date are left alone
 * entirely and flagged instead — a sign the round+half+team filter didn't
 * cleanly land on a single tie (or, for a competition like NL1 that reuses
 * round numbers across different ties, genuinely can't on its own — see
 * `overrides`' `isoDate` field), not a partial-forfeit situation. Same for an
 * entry whose candidates contain neither score at all: nothing here looks
 * like the claimed forfeit, worth a human check rather than guessing —
 * unless it's specifically listed in `overrides`
 * (lib/import/forfeit-overrides.ts), a short hand-reviewed list for whatever
 * doesn't fit even this, where Jeff has decided how to resolve it himself;
 * checked before the multi-date bail-out so an override can narrow down to
 * one specific date, and those matched rows bypass the score check entirely.
 */
function overrideKey(x: {
  flttPlayerId: string;
  half: number;
  round: number;
  team: string;
}): string {
  return `${x.flttPlayerId}|${x.half}|${x.round}|${x.team}`;
}

export function matchForfeits(
  rows: MatchCandidateRow[],
  entries: ForfeitEntry[],
  overrides: ForfeitOverride[] = [],
): ForfeitMatchResult {
  const rowsByPlayer = new Map<string, MatchCandidateRow[]>();
  for (const row of rows) {
    const list = rowsByPlayer.get(row.flttPlayerId);
    if (list) list.push(row);
    else rowsByPlayer.set(row.flttPlayerId, [row]);
  }

  const overridesByKey = new Map<string, ForfeitOverride>();
  for (const o of overrides) overridesByKey.set(overrideKey(o), o);

  const forfeitedRowIds = new Set<string>();
  const reviewLines: string[] = [];

  for (const entry of entries) {
    const playerRows = rowsByPlayer.get(entry.flttPlayerId) ?? [];
    const familyKeyword = FAMILY_COMPETITION_KEYWORD[entry.family];
    const candidates = playerRows.filter(
      (r) =>
        r.round === entry.round &&
        r.competition.includes(`(R${entry.half})`) &&
        (familyKeyword == null || r.competition.includes(familyKeyword)) &&
        (r.matchLabel ?? "").includes(entry.team),
    );

    if (candidates.length === 0) {
      // Not necessarily a matching bug: a genuine no-show tie is sometimes
      // never entered into FLTT's own data at all (round completely absent
      // from the player's history, not just unflagged) — confirmed for real
      // with Jeff on 2026-08-12 (DUPREL Christian, S-2.7). When that's the
      // case there's nothing to correct here: no game means no wrongly
      // computed rating change for anyone in the first place. Left as a
      // review line rather than silently dropped only because this function
      // has no way to tell that apart from an actual mismatch (wrong team
      // spelling, a genuinely missing Mongo row that should exist, etc.).
      reviewLines.push(
        `${entry.sourceLabel}: no matching game found — if this round is genuinely absent from ` +
          `their whole season (not just missing the "0-3" pattern), that's a real no-show and ` +
          `there's nothing to fix (no game was ever scored for it); otherwise worth a manual look`,
      );
      continue;
    }

    const override = overridesByKey.get(overrideKey(entry));
    if (override) {
      const overrideCandidates = override.isoDate
        ? candidates.filter((c) => c.isoDate === override.isoDate)
        : candidates;
      if (overrideCandidates.length === 0) {
        reviewLines.push(
          `${entry.sourceLabel}: an override for this entry expects a game on ${override.isoDate}, ` +
            `but none of the ${candidates.length} matched game(s) are on that date — needs manual review`,
        );
        continue;
      }
      for (const c of overrideCandidates) forfeitedRowIds.add(c.id);
      continue;
    }

    const distinctDates = new Set(candidates.map((c) => c.isoDate));
    if (distinctDates.size > 1) {
      reviewLines.push(
        `${entry.sourceLabel}: matched ${candidates.length} games across ${distinctDates.size} ` +
          `different dates — needs manual review`,
      );
      continue;
    }

    const forfeitedCandidates = candidates.filter((c) => c.score === "0-3" || c.score === "0-0");
    if (forfeitedCandidates.length === 0) {
      reviewLines.push(
        `${entry.sourceLabel}: matched ${candidates.length} game(s), none with a "0-3"/"0-0" ` +
          `forfeit score — needs manual review`,
      );
      continue;
    }

    for (const c of forfeitedCandidates) forfeitedRowIds.add(c.id);
  }

  return { forfeitedRowIds, reviewLines };
}

export interface MarkerForfeitResult {
  forfeitedRowIds: Set<string>;
  noteLines: string[];
}

/**
 * Forfaits.xlsx isn't the only source of truth: FLTT's own data privately
 * flags some forfeits with a `hasForfeitMarker` row (see MatchCandidateRow) —
 * confirmed reliable whenever it's present (every marked row checked by hand
 * this season was a genuine forfeit, always paired with the same "0-3"
 * score), but incomplete on its own (only ~1 in 3 of Jeff's own listed
 * forfeits carry it, so it can't replace the spreadsheet as the primary
 * source). Its real value is catching forfeits the spreadsheet MISSED
 * entirely — confirmed for real with Jeff on 2026-08-13: KLIDJO Georges Laël
 * forfeited three boards in a Lëntgen 4 tie, each one carrying this marker,
 * but he doesn't appear on either Forfaits.xlsx sheet at all.
 *
 * Scans every row (not just ones tied to a Forfaits.xlsx entry) and returns
 * any marked-and-"0-3" row not already caught by `matchForfeits`, so the two
 * sources combine instead of one silently missing what the other already
 * found. Reported as `noteLines` (not `reviewLines`) — this isn't an
 * ambiguous case needing a human decision, just something worth being
 * visible about since it wasn't in the spreadsheet.
 */
export function findMarkerOnlyForfeits(
  rows: MatchCandidateRow[],
  alreadyForfeited: Set<string>,
): MarkerForfeitResult {
  const forfeitedRowIds = new Set<string>();
  const noteLines: string[] = [];

  for (const row of rows) {
    if (alreadyForfeited.has(row.id) || forfeitedRowIds.has(row.id)) continue;
    if (!row.hasForfeitMarker || row.score !== "0-3") continue;
    forfeitedRowIds.add(row.id);
    noteLines.push(
      `${row.flttPlayerId} — ${row.isoDate} — ${row.competition} — vs opponent on row ${row.id}: ` +
        `FLTT's own data marks this a forfeit, but it isn't in Forfaits.xlsx`,
    );
  }

  return { forfeitedRowIds, noteLines };
}

export interface ForfeitExclusion {
  flttPlayerId: string;
  name: string;
  isoDate: string;
  opponentName: string;
  note: string;
}

/**
 * A known false positive: a specific board that one of the three detection
 * signals (a clean "0-3" from Forfaits.xlsx, FLTT's own internal marker, or
 * the Performance-table gap) would otherwise treat as a forfeit, but Jeff
 * has personally confirmed was a real, played match — a genuine blowout
 * loss just happens to look identical to a forfeit from the score alone, or
 * a real match just hasn't had its Performance row crawled yet (now that
 * the gap signal auto-applies, this is also its safety valve for a false
 * positive that slips past its own structural filters). Applied last, after
 * all three signals have run, so it can veto any of them regardless of
 * which found it.
 *
 * Confirmed for real with Jeff on 2026-08-13: BRITTNACHER Jürgen's
 * Forfaits.xlsx entry (S-1.4/XG-0142, Zolwer 1's 2025-10-11 tie at
 * Beetebuerg-P. 2) matched two "0-3" boards — his real forfeit was against
 * HAMROUNI Slim, but the *other* board that same day, against BIERNACKI
 * Kacper, was a real match that just ended 0-3.
 */
export const FORFEIT_EXCLUSIONS: ForfeitExclusion[] = [
  {
    flttPlayerId: "25817",
    name: "BRITTNACHER Jürgen",
    isoDate: "2025-10-11",
    opponentName: "BIERNACKI Kacper",
    note:
      "Real match, not a forfeit — his teammate's board that same day (vs HAMROUNI Slim, same " +
      "tie) is the actual forfeit and should stay FF.",
  },
  // RASOULI Sadra's matches are handled player-wide by PERFORMANCE_GAP_EXEMPT_PLAYERS below.
];

/**
 * Removes any row matching a `FORFEIT_EXCLUSIONS` entry from an
 * already-computed forfeit set — applied once, centrally, to the combined
 * result of `matchForfeits` and `findMarkerOnlyForfeits`, so a known false
 * positive is vetoed regardless of which detection path produced it.
 */
export function excludeKnownFalsePositives(
  rows: MatchCandidateRow[],
  forfeitedRowIds: Set<string>,
  exclusions: ForfeitExclusion[],
): Set<string> {
  if (exclusions.length === 0) return forfeitedRowIds;
  const excludedRowIds = new Set(
    rows
      .filter((r) =>
        exclusions.some(
          (e) =>
            e.flttPlayerId === r.flttPlayerId &&
            e.isoDate === r.isoDate &&
            e.opponentName === r.opponentName,
        ),
      )
      .map((r) => r.id),
  );
  if (excludedRowIds.size === 0) return forfeitedRowIds;
  return new Set([...forfeitedRowIds].filter((id) => !excludedRowIds.has(id)));
}

/** A season match row plus the two extra fields `findPerformanceGapForfeits`
 * needs beyond `MatchCandidateRow`: the player's own name (to find this row's
 * mirror on the opponent's side) and whether FLTT's Performance table has a
 * joined row for it. */
export interface PerformanceGapRow extends MatchCandidateRow {
  playerName: string;
  hasPerformance: boolean;
}

export interface PerformanceGapExemptPlayer {
  flttPlayerId: string;
  name: string;
  note: string;
}

/**
 * Players FLTT deliberately keeps out of the Performance table, so a missing
 * Performance row says nothing about a forfeit for any match they're in.
 * Every such match is skipped by `findPerformanceGapForfeits` — from the
 * player's own side AND from each opponent's side (matched by name, since an
 * opponent's row only carries the exempt player's name) — while Forfaits.xlsx
 * and FLTT's own marker still apply to them as normal.
 */
export const PERFORMANCE_GAP_EXEMPT_PLAYERS: PerformanceGapExemptPlayer[] = [
  {
    flttPlayerId: "28585",
    name: "RASOULI Sadra",
    note:
      "Confirmed with Jeff 2026-10-18: FLTT manually excluded all his 2026-2027 games from the " +
      "Performance table because his starting rating was set too low there, to protect his " +
      "opponents. Every game is real and rated here, from the corrected start in " +
      "SEASON_START_OVERRIDES.",
  },
];

// FLTT's Performance table is a rolling trailing-12-months window measured
// from whenever it's crawled, NOT scoped to the FLTT season (which is itself
// ~365 days long, July 1 - June 30) — confirmed with Jeff on 2026-08-15. A
// match from early in the season legitimately falls out of that window well
// before the season itself is a year old, with nothing forfeit-related about
// it. Left unguarded, that would look EXACTLY like a real gap (a small,
// otherwise-unexplained hole in an otherwise-normal player's history) the
// longer this runs after the match was actually played — including every
// time this is re-run during season-rollover work months after the season
// ended. 335 days (~11 months) leaves roughly a month of safety margin under
// the 365-day window for crawl lag and any imprecision in FLTT's exact
// rolling-window boundary; a row older than that is excluded entirely rather
// than risk flagging a real, already-rated match as a forfeit candidate.
const PERFORMANCE_WINDOW_SAFETY_DAYS = 335;

// The opposite edge: FLTT's own Performance-table crawl trails its
// Rencontres (games) table by some number of days, independent of the
// 12-month window above — confirmed for real 2026-10-02 via MINDEN
// Christophe, whose CH SEN N2-D5 Performance rows existed for his Sept 19
// and Sept 26 matchdays but not yet for Sept 30 (2 days before the check).
// A match newer than this is simply too fresh for FLTT's own Performance
// table to have caught up to yet — not a forfeit candidate at all — so it's
// excluded the same way an aged-out-the-other-end match is, rather than
// flagged as a gap. Without this, re-running this check shortly after a
// matchday (the normal case: the weekly automation runs a few hours after
// FLTT's own Thursday refresh) produces a flood of perfectly normal,
// just-played matches as false candidates, swamping the genuine ones —
// confirmed for real the same day: 151 of 175 candidates were from the two
// most recent matchdays alone, several with plainly non-forfeit scores
// (3-2, 1-3, etc.) proving they were real, competitively played matches.
// 10 days leaves a comfortable margin over the ~6 days observed, without
// delaying real forfeits' detection by more than about a week and a half.
const PERFORMANCE_CRAWL_LAG_SAFETY_DAYS = 10;

function daysBetween(earlierIsoDate: string, laterIsoDate: string): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round(
    (Date.parse(`${laterIsoDate}T00:00:00Z`) - Date.parse(`${earlierIsoDate}T00:00:00Z`)) /
      msPerDay,
  );
}

/** One entry from Jeff's manual review of a `findPerformanceGapForfeits`
 * candidate, from back when every candidate needed individual sign-off — see
 * `PERFORMANCE_GAP_CONFIRMED_FORFEITS` in
 * `lib/import/performance-gap-confirmed-forfeits.ts` for the full history.
 * No longer consulted by `findPerformanceGapForfeits` itself (see that
 * function's doc comment for why), kept only as that record. */
export interface PerformanceGapConfirmedForfeit {
  flttPlayerId: string;
  name: string;
  isoDate: string;
  note?: string;
}

export interface PerformanceGapResult {
  /** Every row this signal surfaced, after all of its own structural
   * filters (tournament/cup exclusion, opponent-of-forfeit dedup, the
   * too-old and too-new Performance-window margins, and the whole-player
   * crawl-gap skip) — auto-applied directly, same trust level as the other
   * two forfeit signals. See the function's doc comment for why this no
   * longer needs a human to confirm each one first. */
  forfeitedRowIds: Set<string>;
}

/**
 * A third, independent forfeit signal, alongside Forfaits.xlsx
 * (`matchForfeits`) and FLTT's own internal marker (`findMarkerOnlyForfeits`):
 * a game that's in a player's Rencontres ("Games recorded") history but has
 * no joined row in their Performance table. Jeff's idea, spot-checked against
 * fltt.lu directly for several real cases before building this (2026-08-14).
 * A full manual review of the first season's 150 candidates (2026-08-15)
 * confirmed all 73 deduped incidents as genuine forfeits — zero false
 * positives within that reviewed list. (POOS Piotr, the whole-player
 * crawl-staleness case that motivated the filter below, showed up during
 * EARLIER exploratory work, before this function's crawl-staleness check
 * existed to exclude cases like his automatically — he was never actually
 * one of these 150 candidates.) See
 * `lib/import/performance-gap-confirmed-forfeits.ts` for that review's full
 * history.
 *
 * Auto-applied directly since 2026-10-02 — every surfaced candidate folds
 * straight into `forfeitedRowIds`, same trust level as the other two
 * signals, no per-case human sign-off first. Two track records back that:
 * the 73/73 clean result above, and a second spot-check the day the
 * too-new crawl-lag filter below was added — 5 candidates picked at random
 * from that day's post-fix list, all 5 confirmed genuine by Jeff against
 * fltt.lu. Two distinct causes can still produce the exact same "missing
 * Performance row" shape without being a forfeit at all, so both are
 * filtered out structurally before anything reaches `forfeitedRowIds`:
 *
 * 1. Tournament (TOU) and cup (COU FELTEN) games never get a Performance row
 *    regardless of outcome — excluded via `isTournamentCompetition` /
 *    `isNonRatedCompetition`, same rule `simulateSeason` uses to exclude them
 *    from rating entirely.
 * 2. A forfeit only gets recorded against the FORFEITING player — the
 *    opponent who won by default has a perfectly normal row that also lacks
 *    a Performance entry (no real match was played for either side), with
 *    nothing forfeit-related about it being "wrong". Filtered by looking up
 *    each row's mirror (the same tie from the opponent's own perspective,
 *    matched on date + competition + both players' names, since a match
 *    between two tracked players is stored once per side — see
 *    `Dataset/DATASET_HANDOFF.md` section 5.8) and dropping it silently
 *    whenever that mirror is already a known forfeit.
 *
 * A third cause is real but NOT filtered here, because it can't be told apart
 * from a genuine forfeit by looking at the row alone: FLTT Progress Tracker's
 * own crawl of a player's Performance table can simply be stale/incomplete
 * for that whole player — confirmed for real with POOS Piotr (2026-08-14),
 * whose entire season showed zero joined Performance rows despite fltt.lu's
 * live page having real Performance data for every one of his games. The
 * tell distinguishing this from a real forfeit: Piotr had NO Performance rows
 * anywhere all season, whereas Finja/Reff/Decker were otherwise normal
 * players with a small gap on one specific day. So any player with zero
 * Performance rows across their *entire* set of rated rows this season is
 * skipped entirely (both their missing AND present rows) — there's no way to
 * tell a real forfeit from a crawl gap for that player from this signal
 * alone, and flagging every one of their games as a candidate would just be
 * noise.
 *
 * A fourth cause, also not tellable apart from a real forfeit by looking at
 * one row: the match has simply aged out of FLTT's trailing-12-months
 * Performance window (see `PERFORMANCE_WINDOW_SAFETY_DAYS` above) — filtered
 * by `nowIsoDate`, dropping anything old enough that it could plausibly have
 * rolled off already.
 *
 * A fifth cause, the opposite edge of the fourth: the match is too NEW —
 * FLTT's own Performance-table crawl trails its Rencontres table by some
 * number of days, so a just-played match hasn't had its Performance row
 * populated yet regardless of outcome (see `PERFORMANCE_CRAWL_LAG_SAFETY_DAYS`
 * above). Confirmed for real 2026-10-02: running this mid-season, days after
 * the two most recent matchdays, produced 151 of 175 candidates from those
 * two days alone, several with plainly non-forfeit scores (3-2, 1-3) proving
 * they were real, competitively played matches FLTT just hadn't caught up on
 * yet — also filtered by `nowIsoDate`.
 *
 * What's left after all of that is applied straight to `forfeitedRowIds` —
 * whichever side's row this is (the forfeiting player's own row, or their
 * opponent's), either is enough: `simulateSeason`'s `canonicalizeMatches`
 * already treats a tracked-vs-tracked match as a forfeit if EITHER mirrored
 * row says so. If a genuinely wrong case ever turns up despite this track
 * record, exclude it via `FORFEIT_EXCLUSIONS` in `forfeit-overrides.ts`
 * (it's keyed generically enough to cover a row from any of the three
 * signals, not just Forfaits.xlsx) rather than reviving a confirm-first
 * gate here.
 */
export function findPerformanceGapForfeits(
  rows: PerformanceGapRow[],
  alreadyForfeited: Set<string>,
  nowIsoDate: string,
  exemptPlayers: PerformanceGapExemptPlayer[] = PERFORMANCE_GAP_EXEMPT_PLAYERS,
): PerformanceGapResult {
  const exemptIds = new Set(exemptPlayers.map((p) => p.flttPlayerId));
  const exemptNameKeys = new Set(exemptPlayers.map((p) => nameKey(p.name)));
  const ratedRows = rows.filter((r) => {
    const age = daysBetween(r.isoDate, nowIsoDate);
    return (
      !exemptIds.has(r.flttPlayerId) &&
      !exemptNameKeys.has(nameKey(r.opponentName)) &&
      !isTournamentCompetition(r.competition) &&
      !isNonRatedCompetition(r.competition) &&
      age >= PERFORMANCE_CRAWL_LAG_SAFETY_DAYS &&
      age < PERFORMANCE_WINDOW_SAFETY_DAYS
    );
  });

  const playersWithSomePerformance = new Set<string>();
  for (const r of ratedRows) {
    if (r.hasPerformance) playersWithSomePerformance.add(r.flttPlayerId);
  }

  // "(R2)" / "(R1)" half-season suffix only — keep everything else (the
  // family both halves of a competition share) so a mirror row can be found
  // regardless of which half's rounding it's recorded under.
  const family = (competition: string) => competition.replace(/\s*\(R\d+\)\s*$/, "").trim();
  const mirrorIndex = new Map<string, PerformanceGapRow>();
  for (const r of ratedRows) {
    mirrorIndex.set(
      `${nameKey(r.playerName)}|${r.isoDate}|${family(r.competition)}|${nameKey(r.opponentName)}`,
      r,
    );
  }

  const forfeitedRowIds = new Set<string>();
  for (const r of ratedRows) {
    if (r.hasPerformance) continue;
    if (alreadyForfeited.has(r.id)) continue;
    if (!playersWithSomePerformance.has(r.flttPlayerId)) continue;

    const mirror = mirrorIndex.get(
      `${nameKey(r.opponentName)}|${r.isoDate}|${family(r.competition)}|${nameKey(r.playerName)}`,
    );
    // The winning side of an already-known forfeit — not a new candidate.
    if (mirror && alreadyForfeited.has(mirror.id)) continue;

    forfeitedRowIds.add(r.id);
  }

  return { forfeitedRowIds };
}
