import { createPublicClient } from "@/lib/supabase/public";

interface CompetitionClubTeamCountRow {
  competition_id: string;
  club: string;
  team_count: number;
}

/**
 * Known per-club team counts for the given season, keyed by competition id
 * then club — used to prefill (not lock) the Lineup Builder's team-count
 * field. Imported via /admin/competitions/team-counts, not hand-entered.
 * Small table, no caching needed (same reasoning as getCompetitions).
 */
export async function getCompetitionTeamCounts(
  season: string,
): Promise<Record<string, Record<string, number>>> {
  const supabase = createPublicClient();
  const { data, error } = await supabase
    .from("competition_club_team_counts")
    .select("competition_id, club, team_count")
    .eq("season", season);
  if (error) throw new Error(error.message);

  const byCompetition: Record<string, Record<string, number>> = {};
  for (const row of data as CompetitionClubTeamCountRow[]) {
    (byCompetition[row.competition_id] ??= {})[row.club] = row.team_count;
  }
  return byCompetition;
}
