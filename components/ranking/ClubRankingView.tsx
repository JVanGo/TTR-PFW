"use client";

import { useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import type { RankingRow } from "@/lib/ranking";
import type { Competition } from "@/lib/competitions";
import type { ClubTeamCount } from "@/lib/competitionTeamCounts";
import { RankingTable } from "@/components/ranking/RankingTable";
import { LineupBuilder } from "@/components/ranking/LineupBuilder";

interface Props {
  rows: RankingRow[];
  clubs: string[];
  selectedLevel: string;
  initialClub: string;
  competitions: Competition[];
  teamCountsByCompetition: Record<string, Record<string, ClubTeamCount>>;
  /** ISO date of the newest Verbandsrangliste snapshot this season, or null if none yet. */
  snapshotDate: string | null;
}

/**
 * The ranking narrowed by club and/or level, plus the Lineup Builder for the
 * club. With a club picked, `rows` holds only that club's players, so
 * picking another club in the dropdown loads that club's page (keeping the
 * class filter) rather than filtering locally.
 */
export function ClubRankingView({
  rows,
  clubs,
  selectedLevel,
  initialClub,
  competitions,
  teamCountsByCompetition,
  snapshotDate,
}: Props) {
  const club = initialClub;
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const changeClub = (next: string) => {
    const params = new URLSearchParams();
    if (selectedLevel !== "All") params.set("level", selectedLevel);
    if (next) params.set("club", next);
    const query = params.toString();
    startTransition(() => router.push(query ? `/ranking?${query}` : "/ranking"));
  };

  // `rows` only ever contains roster-active players — lib/ranking.ts
  // excludes anyone dropped from FLTT's official list before this point.
  const roster = club ? rows.filter((r) => r.club === club) : [];

  return (
    <div
      className={
        (club ? "grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px] " : "") +
        (isPending ? "opacity-60 transition-opacity" : "")
      }
      aria-busy={isPending}
    >
      <RankingTable
        rows={rows}
        clubs={clubs}
        selectedLevel={selectedLevel}
        club={club}
        onClubChange={changeClub}
      />
      {club && roster.length > 0 && (
        <LineupBuilder
          club={club}
          roster={roster}
          competitions={competitions}
          teamCountsByCompetition={teamCountsByCompetition}
          snapshotDate={snapshotDate}
        />
      )}
    </div>
  );
}
