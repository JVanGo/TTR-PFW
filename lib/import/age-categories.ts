import * as XLSX from "xlsx";
import type { SupabaseClient } from "@supabase/supabase-js";
import { nameKey } from "@/lib/name-key";
import { fetchAllRows } from "@/lib/supabase/fetchAll";
import { AGE_CATEGORIES, type AgeCategory } from "@/lib/age-categories";

export { AGE_CATEGORIES, type AgeCategory };

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
  /** Player ids to reset back to adult (age_category = null) — currently tagged
   * with a youth category but no longer listed in this export, i.e. aged out. */
  cleared: string[];
}

interface PlayerRow {
  id: string;
  name_key: string;
  age_category: string | null;
}

/**
 * Pure: resolve parsed age-category entries against known players by
 * nameKey(). A nameKey shared by two entries with different categories is
 * reported as ambiguous (first-seen category wins) rather than guessed at.
 *
 * Each export is treated as the complete, authoritative youth roster as of
 * that moment (mirrors diffRangliste's toDeactivate) — a player who ages out
 * of every youth category simply stops appearing in it, so anyone currently
 * tagged with a category but absent from this export is reset back to adult
 * rather than keeping a stale category (and its K-bonus, starting rating,
 * and Lineup Builder tolerances) forever.
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

  const updatedIds = new Set(updates.map((u) => u.id));
  const cleared = players
    .filter((p) => p.age_category != null && !updatedIds.has(p.id))
    .map((p) => p.id);

  return { matched, unmatched, ambiguous, updates, cleared };
}

export async function applyAgeCategoriesToSupabase(
  supabase: SupabaseClient,
  entries: AgeCategoryEntry[],
  log: (message: string) => void = () => {},
): Promise<BuildAgeCategoryUpdatesResult> {
  log("Loading existing players from Supabase...");
  const players = await fetchAllRows<PlayerRow>(supabase, "players", "id, name_key, age_category");
  log(`  ${players.length} existing players.`);

  const result = buildAgeCategoryUpdates(entries, players);

  for (const ambig of result.ambiguous) {
    log(
      `  Ambiguous name "${ambig.nameKey}": categories ${ambig.categories.join(", ")} — using ${ambig.categories[0]}.`,
    );
  }
  log(
    `  ${result.matched} matched, ${result.unmatched} unmatched (not in players table), ` +
      `${result.cleared.length} reset to adult (no longer in this export).`,
  );

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

  if (result.cleared.length > 0) {
    log(`Clearing age category for ${result.cleared.length} players aged out of every category...`);
    for (let i = 0; i < result.cleared.length; i += 200) {
      const chunk = result.cleared.slice(i, i + 200);
      const { error } = await supabase
        .from("players")
        .update({ age_category: null })
        .in("id", chunk);
      if (error) throw new Error(error.message);
    }
  }

  return result;
}
