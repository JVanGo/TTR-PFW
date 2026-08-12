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
  /** The "(R{half})" half-season number embedded in the match's `competition` string. */
  half: number;
  /** Matches `rencontres.round` on the player's own Mongo match rows exactly. */
  round: number;
  /** The forfeiting player's own team ("Equipe"), a substring of `rencontres.matchLabel`. */
  team: string;
  /** For review-log lines, e.g. "CASTANO COPOT Tomas (FF, S-1.2/XC-0209)". */
  sourceLabel: string;
}

/** "S-2.8" -> { half: 2, round: 8 }. The leading family-letter code (S/C/MIN/JEU/KC/N/D)
 * isn't needed for matching — half+round+team disambiguates cleanly on its own
 * (confirmed against real season data) — so it's ignored here. */
export function parseSpT(spt: string): { half: number; round: number } | null {
  const m = spt.trim().match(/^[A-Za-z]+-(\d+)\.(\d+)$/);
  if (!m) return null;
  return { half: Number(m[1]), round: Number(m[2]) };
}

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
}

export interface ForfeitMatchResult {
  forfeitedRowIds: Set<string>;
  reviewLines: string[];
}

/**
 * Matches each Forfaits.xlsx entry to the forfeiting player's own season match
 * row(s) for that team tie (round+half+team — see parseSpT's comment for why
 * the family-letter code isn't needed), then only actually treats it as a
 * confirmed forfeit for any matched row that's an exact "0-3" — the reliable
 * signature seen on every genuine forfeit checked by hand. Judged per row, not
 * as an all-or-nothing group: a player can forfeit just one board of a
 * multi-board tie while playing the others for real (confirmed with Jeff on
 * 2026-08-12 — OMS Mara played and lost her first board 1-3, then forfeited
 * her second, 0-3; only the second should move zero points). Candidates
 * spanning more than one date are left alone entirely and flagged instead — a
 * sign the round+half+team filter didn't cleanly land on a single tie, not a
 * partial-forfeit situation. Same for an entry whose candidates contain no
 * "0-3" row at all: nothing here looks like the claimed forfeit, worth a
 * human check rather than guessing — unless it's specifically listed in
 * `overrides` (lib/import/forfeit-overrides.ts), a short hand-reviewed list
 * of exactly these cases where Jeff has decided how to resolve the ambiguity
 * himself; those bypass the score check entirely.
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

  const overrideKeys = new Set(overrides.map(overrideKey));

  const forfeitedRowIds = new Set<string>();
  const reviewLines: string[] = [];

  for (const entry of entries) {
    const playerRows = rowsByPlayer.get(entry.flttPlayerId) ?? [];
    const candidates = playerRows.filter(
      (r) =>
        r.round === entry.round &&
        r.competition.includes(`(R${entry.half})`) &&
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

    const distinctDates = new Set(candidates.map((c) => c.isoDate));
    if (distinctDates.size > 1) {
      reviewLines.push(
        `${entry.sourceLabel}: matched ${candidates.length} games across ${distinctDates.size} ` +
          `different dates — needs manual review`,
      );
      continue;
    }

    if (overrideKeys.has(overrideKey(entry))) {
      for (const c of candidates) forfeitedRowIds.add(c.id);
      continue;
    }

    const forfeitedCandidates = candidates.filter((c) => c.score === "0-3");
    if (forfeitedCandidates.length === 0) {
      reviewLines.push(
        `${entry.sourceLabel}: matched ${candidates.length} game(s), none with the "0-3" forfeit ` +
          `score — needs manual review`,
      );
      continue;
    }

    for (const c of forfeitedCandidates) forfeitedRowIds.add(c.id);
  }

  return { forfeitedRowIds, reviewLines };
}
