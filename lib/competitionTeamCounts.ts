import { createPublicClient } from "@/lib/supabase/public";

interface CompetitionClubTeamCountRow {
  competition_id: string;
  club: string;
  team_count: number;
  adjacent_only_team_count: number;
}

export interface ClubTeamCount {
  teamCount: number;
  /** How many of the club's first teams play in NL1–NL3 (adjacent-only swaps, see legalTargetIndices). */
  adjacentOnlyTeamCount: number;
}

/**
 * Known per-club team counts for the given season, keyed by competition id
 * then club — used to prefill (not lock) the Lineup Builder's team-count
 * field. Imported via /admin/competitions/team-counts, not hand-entered.
 * Small table, no caching needed (same reasoning as getCompetitions).
 */
export async function getCompetitionTeamCounts(
  season: string,
): Promise<Record<string, Record<string, ClubTeamCount>>> {
  const supabase = createPublicClient();
  const { data, error } = await supabase
    .from("competition_club_team_counts")
    .select("competition_id, club, team_count, adjacent_only_team_count")
    .eq("season", season);
  if (error) throw new Error(error.message);

  const byCompetition: Record<string, Record<string, ClubTeamCount>> = {};
  for (const row of data as CompetitionClubTeamCountRow[]) {
    (byCompetition[row.competition_id] ??= {})[row.club] = {
      teamCount: row.team_count,
      adjacentOnlyTeamCount: row.adjacent_only_team_count,
    };
  }
  return byCompetition;
}
