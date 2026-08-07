import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import * as XLSX from "xlsx";
import { isPlayerClass, usesClassementPoints, type PlayerClass } from "@/lib/conversions";

const CLASSEMENT_MIN = -5.5;
const CLASSEMENT_MAX = 11.5;

// FLTT can produce a membership export snapshotting every player's class,
// classement points, and PFW as of a given date — the authoritative source
// for a player's season-start rating when Jeff has one on hand. Gitignored/
// local-only (see TTR/ in the repo layout); update this filename each season
// a fresher export is provided.
export const SEASON_START_EXPORT_PATH = path.join(process.cwd(), "TTR", "Export-Members (34).xlsx");

export interface SeasonStartExportEntry {
  flttPlayerId: string;
  class: PlayerClass;
  pfw: number;
  classementPoints: number | null;
}

interface RawRow {
  licenceNumber?: unknown;
  ranking?: unknown;
  rankingPoints?: unknown;
  performancePf?: unknown;
}

/**
 * Parses the FLTT membership export (`licenceNumber, lastname, firstname,
 * ranking, rankingPoints, performancePfInitial, performancePf, clubName`)
 * that the federation can produce as a snapshot of every player's class,
 * classement standing, and PFW as of a given date — the authoritative
 * alternative to inferring a season-start snapshot from match history (see
 * season-start-snapshot.ts), when such a file is available.
 *
 * Uses `performancePf`, not `performancePfInitial`: confirmed with Jeff that
 * `performancePfInitial` is the player's PFW at the *start* of the season
 * before this export's target season, while `performancePf` is their PFW at
 * the *end* of that prior season — which is the same instant as the start of
 * the season we actually want (25-26). Using `performancePfInitial` was
 * silently reading a full season out of date.
 *
 * `rankingPoints` is clamped to the classement's -5.5..11.5 range: the raw
 * export has occasionally gone slightly outside it (observed as far as
 * -6.5/+16.5), which would otherwise spill a player's estimate into a
 * neighboring class's band.
 *
 * `performancePf` of exactly `0` (`performancePfInitial` is also `0` on the
 * same rows) shows up ~75 times in a real export, spread across every class
 * — a placeholder for "not tracked" (brand-new registrations with no prior
 * season at all), not a real score (confirmed: no other row has a PFW
 * between 0 and 50). Taken at face value it feeds the A1-B3 regression a PFW
 * of 0 and produces a nonsensical ~986 TTR regardless of the player's actual
 * class. Skipped for classes where PFW is actually used (usesClassementPoints()
 * is false); kept for classement classes, where it's never read anyway.
 */
export function parseSeasonStartExport(buffer: ArrayBuffer | Buffer): SeasonStartExportEntry[] {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) return [];
  const rows = XLSX.utils.sheet_to_json<RawRow>(sheet);

  const out: SeasonStartExportEntry[] = [];
  for (const row of rows) {
    const licence = row.licenceNumber;
    if (licence == null) continue;
    const flttPlayerId = String(licence).trim();
    if (!flttPlayerId) continue;

    const cls = typeof row.ranking === "string" ? row.ranking.trim().toUpperCase() : "";
    if (!isPlayerClass(cls)) continue;

    const pfwRaw = Number(row.performancePf);
    const pfwUsable = Number.isFinite(pfwRaw) && pfwRaw > 0;
    if (!pfwUsable && !usesClassementPoints(cls)) continue;

    let classementPoints: number | null = null;
    if (typeof row.rankingPoints === "number" && Number.isFinite(row.rankingPoints)) {
      classementPoints = Math.min(CLASSEMENT_MAX, Math.max(CLASSEMENT_MIN, row.rankingPoints));
    }

    out.push({ flttPlayerId, class: cls, pfw: pfwUsable ? pfwRaw : 0, classementPoints });
  }
  return out;
}

/** Reads and parses the export from disk, or [] if no file is present there. */
export function readSeasonStartExportFile(
  filePath: string = SEASON_START_EXPORT_PATH,
): SeasonStartExportEntry[] {
  if (!existsSync(filePath)) return [];
  return parseSeasonStartExport(readFileSync(filePath));
}
