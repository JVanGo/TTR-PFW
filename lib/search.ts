"use server";

import { createClient } from "@/lib/supabase/server";
import { nameKey } from "@/lib/name-key";

export interface PlayerSearchResult {
  id: string;
  name: string;
  club: string | null;
}

/**
 * Player search for the Home page search box. Matches on name_key (accent- and
 * case-insensitive) one query word at a time, so word order in what someone
 * types doesn't have to match the stored "Lastname Firstname" order.
 */
export async function searchPlayers(query: string): Promise<PlayerSearchResult[]> {
  const tokens = query
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => nameKey(w));

  if (tokens.length === 0) return [];

  const supabase = await createClient();
  let q = supabase.from("players").select("id, name, club").eq("is_active", true);
  for (const token of tokens) {
    q = q.ilike("name_key", `%${token}%`);
  }

  const { data, error } = await q.order("name").limit(8);
  if (error) throw new Error(`searchPlayers: ${error.message}`);
  return data ?? [];
}
