import * as XLSX from "xlsx";
import { isPlayerClass, type PlayerClass } from "@/lib/conversions";
import { nameKey } from "@/lib/name-key";

export interface RanglistEntry {
  name: string;
  class: PlayerClass;
  pfw: number;
  club: string | null;
  nameKey: string;
}

/**
 * Parse a Verbandsrangliste Excel export into a list of player rows.
 * Throws on the first malformed row so admins notice the problem before applying.
 *
 * The file layout produced by the FLTT export tooling is roughly:
 *   Rank | Name | Class | Score (PFW) | TTR (legacy column, ignored)
 * Some exports add a Club column. When present it's used.
 */
export function parseRangliste(buffer: ArrayBuffer): RanglistEntry[] {
  const wb = XLSX.read(buffer, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) throw new Error("Workbook has no sheets");
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 });

  const headerIdx = rows.findIndex(
    (r) => Array.isArray(r) && r.some((c) => typeof c === "string" && /name/i.test(c)),
  );
  const startIdx = headerIdx >= 0 ? headerIdx + 1 : 0;
  const header = headerIdx >= 0 ? (rows[headerIdx] as unknown[]) : [];

  const findCol = (predicate: (label: string) => boolean): number => {
    for (let i = 0; i < header.length; i++) {
      const cell = header[i];
      if (typeof cell === "string" && predicate(cell.toLowerCase())) return i;
    }
    return -1;
  };

  let nameCol = findCol((l) => l === "name" || l.includes("name"));
  let classCol = findCol((l) => l.startsWith("kl") || l.includes("class"));
  let pfwCol = findCol((l) => l.includes("pfw") || l.includes("score"));
  const clubCol = findCol((l) => l.includes("club") || l.includes("verein"));

  if (nameCol < 0) nameCol = 1;
  if (classCol < 0) classCol = 2;
  if (pfwCol < 0) pfwCol = 3;

  const out: RanglistEntry[] = [];
  for (let i = startIdx; i < rows.length; i++) {
    const row = rows[i];
    if (!Array.isArray(row)) continue;
    const name = row[nameCol];
    const cls = row[classCol];
    const pfw = row[pfwCol];
    const club = clubCol >= 0 ? row[clubCol] : null;
    if (typeof name !== "string" || !name.trim()) continue;
    if (typeof cls !== "string") continue;
    const normalisedCls = cls.trim().toUpperCase();
    if (!isPlayerClass(normalisedCls)) continue;
    const pfwNum = typeof pfw === "number" ? pfw : Number(pfw);
    if (!Number.isFinite(pfwNum)) continue;
    out.push({
      name: name.trim(),
      class: normalisedCls,
      pfw: pfwNum,
      club: typeof club === "string" && club.trim() ? club.trim() : null,
      nameKey: nameKey(name.trim()),
    });
  }
  return out;
}

export interface RanglistDiff {
  toInsert: RanglistEntry[];
  toUpdate: Array<{ id: string; entry: RanglistEntry }>;
  toDeactivate: string[];
}

export function diffRangliste(
  parsed: RanglistEntry[],
  existing: Array<{ id: string; name_key: string; is_active: boolean }>,
): RanglistDiff {
  const byKey = new Map(existing.map((p) => [p.name_key, p]));
  const parsedKeys = new Set(parsed.map((p) => p.nameKey));

  const toInsert: RanglistEntry[] = [];
  const toUpdate: Array<{ id: string; entry: RanglistEntry }> = [];
  for (const entry of parsed) {
    const match = byKey.get(entry.nameKey);
    if (match) toUpdate.push({ id: match.id, entry });
    else toInsert.push(entry);
  }
  const toDeactivate = existing
    .filter((p) => p.is_active && !parsedKeys.has(p.name_key))
    .map((p) => p.id);

  return { toInsert, toUpdate, toDeactivate };
}
