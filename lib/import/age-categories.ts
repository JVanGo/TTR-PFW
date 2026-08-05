import * as XLSX from "xlsx";
import type { SupabaseClient } from "@supabase/supabase-js";
import { nameKey } from "@/lib/name-key";
import { fetchAllRows } from "@/lib/supabase/fetchAll";

export const AGE_CATEGORIES = [
  "Poussin",
  "Benjamin",
  "Minime",
  "Cadet",
  "Junior",
  "Espoirs",
] as const;

export type AgeCategory = (typeof AGE_CATEGORIES)[number];

const VALID_CATEGORIES = new Set<string>(AGE_CATEGORIES);

export interface AgeCategoryEntry {
  name: string;
  nameKey: string;
  ageCategory: AgeCategory;
}

/**
 * Parse an "Export-Members" workbook: one sheet, columns
 * lastname/firstname/ageCategory (see Dataset export from the FLTT member
 * registry). Rows with an unrecognized category are skipped.
 */
function extractEntries(wb: XLSX.WorkBook): AgeCategoryEntry[] {
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 });
  const entries: AgeCategoryEntry[] = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!Array.isArray(row) || row.length < 3) continue;
    const [lastname, firstname, category] = row;
    if (
      typeof lastname !== "string" ||
      typeof firstname !== "string" ||
      typeof category !== "string"
    ) {
      continue;
    }
    if (!VALID_CATEGORIES.has(category)) continue;
    const name = `${firstname.trim()} ${lastname.trim()}`;
    entries.push({ name, nameKey: nameKey(name), ageCategory: category as AgeCategory });
  }
  return entries;
}

export function parseAgeCategoriesFile(path: string): AgeCategoryEntry[] {
  return extractEntries(XLSX.readFile(path));
}

export interface AmbiguousNameKey {
  nameKey: string;
  categories: AgeCategory[];
}

export interface AgeCategoryUpdate {
  id: string;
  ageCategory: AgeCategory;
}

export interface BuildAgeCategoryUpdatesResult {
  matched: number;
  unmatched: number;
  ambiguous: AmbiguousNameKey[];
  updates: AgeCategoryUpdate[];
}

interface PlayerRow {
  id: string;
  name_key: string;
}

/**
 * Pure: resolve parsed age-category entries against known players by
 * nameKey(). A nameKey shared by two entries with different categories is
 * reported as ambiguous (first-seen category wins) rather than guessed at.
 */
export function buildAgeCategoryUpdates(
  entries: AgeCategoryEntry[],
  players: PlayerRow[],
): BuildAgeCategoryUpdatesResult {
  const categoriesByKey = new Map<string, AgeCategory[]>();
  for (const entry of entries) {
    const existing = categoriesByKey.get(entry.nameKey);
    if (existing) {
      existing.push(entry.ageCategory);
    } else {
      categoriesByKey.set(entry.nameKey, [entry.ageCategory]);
    }
  }

  const ambiguous: AmbiguousNameKey[] = [];
  const resolvedCategory = new Map<string, AgeCategory>();
  for (const [key, categories] of categoriesByKey) {
    const unique = Array.from(new Set(categories));
    if (unique.length > 1) {
      ambiguous.push({ nameKey: key, categories: unique });
    }
    resolvedCategory.set(key, unique[0]);
  }

  const playerIdByKey = new Map(players.map((p) => [p.name_key, p.id]));
  const updates: AgeCategoryUpdate[] = [];
  let matched = 0;
  let unmatched = 0;
  for (const [key, ageCategory] of resolvedCategory) {
    const id = playerIdByKey.get(key);
    if (id) {
      updates.push({ id, ageCategory });
      matched++;
    } else {
      unmatched++;
    }
  }

  return { matched, unmatched, ambiguous, updates };
}

export async function applyAgeCategoriesToSupabase(
  supabase: SupabaseClient,
  entries: AgeCategoryEntry[],
  log: (message: string) => void = () => {},
): Promise<BuildAgeCategoryUpdatesResult> {
  log("Loading existing players from Supabase...");
  const players = await fetchAllRows<PlayerRow>(supabase, "players", "id, name_key");
  log(`  ${players.length} existing players.`);

  const result = buildAgeCategoryUpdates(entries, players);

  for (const ambig of result.ambiguous) {
    log(
      `  Ambiguous name "${ambig.nameKey}": categories ${ambig.categories.join(", ")} — using ${ambig.categories[0]}.`,
    );
  }
  log(`  ${result.matched} matched, ${result.unmatched} unmatched (not in players table).`);

  log(`Updating ${result.updates.length} players' age category...`);
  for (let i = 0; i < result.updates.length; i += 200) {
    const chunk = result.updates.slice(i, i + 200);
    const results = await Promise.all(
      chunk.map(({ id, ageCategory }) =>
        supabase.from("players").update({ age_category: ageCategory }).eq("id", id),
      ),
    );
    const failed = results.find((r) => r.error);
    if (failed?.error) throw new Error(failed.error.message);
  }

  return result;
}
