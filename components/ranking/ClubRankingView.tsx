"use client";

import { useState } from "react";
import type { RankingRow } from "@/lib/ranking";
import type { Competition } from "@/lib/competitions";
import { RankingTable } from "@/components/ranking/RankingTable";
import { LineupBuilder } from "@/components/ranking/LineupBuilder";

interface Props {
  rows: RankingRow[];
  clubs: string[];
  initialClub: string;
  competitions: Competition[];
  teamCountsByCompetition: Record<string, Record<string, number>>;
}

/**
 * Owns club-selection state so the Lineup Builder (which needs a fixed
 * roster) can react live to the same club dropdown RankingTable renders,
 * rather than only seeing the club from the initial page load.
 */
export function ClubRankingView({
  rows,
  clubs,
  initialClub,
  competitions,
  teamCountsByCompetition,
}: Props) {
  const [club, setClub] = useState(initialClub);

  // `rows` only ever contains roster-active players — lib/ranking.ts
  // excludes anyone dropped from FLTT's official list before this point.
  const roster = club ? rows.filter((r) => r.club === club) : [];

  return (
    <div className={club ? "grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]" : ""}>
      <RankingTable rows={rows} clubs={clubs} club={club} onClubChange={setClub} />
      {club && roster.length > 0 && (
        <LineupBuilder
          club={club}
          roster={roster}
          competitions={competitions}
          teamCountsByCompetition={teamCountsByCompetition}
        />
      )}
    </div>
  );
}
