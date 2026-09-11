import { createPublicClient } from "@/lib/supabase/public";
import type { AgeCategory } from "@/lib/age-categories";

export interface Competition {
  id: string;
  name: string;
  maxAgeCategory: AgeCategory | null;
  fixedTeamCount: number | null;
  teamSize: number;
}

interface CompetitionRow {
  id: string;
  name: string;
  max_age_category: string | null;
  fixed_team_count: number | null;
  team_size: number;
}

/**
 * The competitions the Lineup Builder can build a roster for. A small,
 * rarely-changing table (managed via /admin/competitions), so a plain read
 * on every request is fine — no caching layer needed, unlike getRankingRows.
 */
export async function getCompetitions(): Promise<Competition[]> {
  const supabase = createPublicClient();
  const { data, error } = await supabase
    .from("competitions")
    .select("id, name, max_age_category, fixed_team_count, team_size")
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  if (error) throw new Error(error.message);

  return (data as CompetitionRow[]).map((row) => ({
    id: row.id,
    name: row.name,
    maxAgeCategory: row.max_age_category as AgeCategory | null,
    fixedTeamCount: row.fixed_team_count,
    teamSize: row.team_size,
  }));
}
