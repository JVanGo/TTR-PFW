import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import * as XLSX from "xlsx";
import type { ForfeitOverride } from "@/lib/import/forfeit-overrides";

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
