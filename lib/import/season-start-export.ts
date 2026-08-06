import * as XLSX from "xlsx";
import { isPlayerClass, type PlayerClass } from "@/lib/conversions";

const CLASSEMENT_MIN = -5.5;
const CLASSEMENT_MAX = 11.5;

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
  performancePfInitial?: unknown;
}

/**
 * Parses the FLTT membership export (`licenceNumber, lastname, firstname,
 * ranking, rankingPoints, performancePfInitial, performancePf, clubName`)
 * that the federation can produce as a snapshot of every player's class,
 * classement standing, and PFW as of a given date — the authoritative
 * alternative to inferring a season-start snapshot from match history (see
 * season-start-snapshot.ts), when such a file is available.
 *
 * `rankingPoints` is clamped to the classement's -5.5..11.5 range: the raw
 * export has occasionally gone slightly outside it (observed as far as
 * -6.5/+16.5), which would otherwise spill a player's estimate into a
 * neighboring class's band.
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

    const pfw = Number(row.performancePfInitial);
    if (!Number.isFinite(pfw)) continue;

    let classementPoints: number | null = null;
    if (typeof row.rankingPoints === "number" && Number.isFinite(row.rankingPoints)) {
      classementPoints = Math.min(CLASSEMENT_MAX, Math.max(CLASSEMENT_MIN, row.rankingPoints));
    }

    out.push({ flttPlayerId, class: cls, pfw, classementPoints });
  }
  return out;
}
