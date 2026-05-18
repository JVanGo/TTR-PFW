import * as XLSX from "xlsx";
import { nameKey } from "@/lib/name-key";

export interface ParsedMatch {
  date: string;
  competition: string;
  opponent_name: string;
  opponent_ttr: number | null;
  score: string;
  result: "W" | "L";
  ttr_delta: number;
  new_ttr: number;
}

export interface ParsedPlayerMatches {
  sheetName: string;
  nameKey: string;
  matches: ParsedMatch[];
}

/**
 * Walk every per-player sheet of a TTR-Saisonentwicklung.xlsx and produce a
 * { sheetName, nameKey, matches[] } per player. The two Overview sheets are
 * skipped.
 */
export function parseSaisonentwicklung(buffer: ArrayBuffer): ParsedPlayerMatches[] {
  const wb = XLSX.read(buffer, { type: "array" });
  const skip = new Set(["Overview", "Overview (TOU)"]);
  const out: ParsedPlayerMatches[] = [];

  for (const sheetName of wb.SheetNames) {
    if (skip.has(sheetName)) continue;
    const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sheetName], { header: 1 });
    const matches: ParsedMatch[] = [];
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!Array.isArray(row) || row.length < 8) continue;
      const [date, competition, opponent, oppTtrRaw, score, wl, deltaRaw, newTtrRaw] = row;
      if (
        typeof date !== "string" ||
        typeof competition !== "string" ||
        typeof opponent !== "string"
      ) {
        continue;
      }
      if (wl !== "W" && wl !== "L") continue;
      matches.push({
        date,
        competition,
        opponent_name: opponent,
        opponent_ttr: typeof oppTtrRaw === "number" ? oppTtrRaw : null,
        score: typeof score === "string" ? score : String(score ?? ""),
        result: wl,
        ttr_delta: Math.round(typeof deltaRaw === "number" ? deltaRaw : Number(deltaRaw) || 0),
        new_ttr: Math.round(typeof newTtrRaw === "number" ? newTtrRaw : Number(newTtrRaw) || 0),
      });
    }
    out.push({ sheetName, nameKey: nameKey(sheetName), matches });
  }
  return out;
}
