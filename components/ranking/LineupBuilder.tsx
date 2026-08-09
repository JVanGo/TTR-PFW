"use client";

import { useState } from "react";
import { Minus, Plus } from "lucide-react";
import { buildTeams, legalTargetIndices, movePlayer, type LineupPlayer } from "@/lib/lineup";
import { Button } from "@/components/ui/button";

export interface LineupRosterPlayer extends LineupPlayer {
  klassierung: string;
}

interface Props {
  club: string;
  roster: LineupRosterPlayer[];
}

const MAX_TEAMS = 10;

function clampTeamCount(n: number): number {
  return Math.min(MAX_TEAMS, Math.max(1, n));
}

function topDtrIds(players: LineupRosterPlayer[], count: number): Set<string> {
  return new Set(
    [...players]
      .sort((a, b) => b.dtr - a.dtr)
      .slice(0, count)
      .map((p) => p.id),
  );
}

export function LineupBuilder({ club, roster }: Props) {
  const sortedRoster = [...roster].sort((a, b) => b.dtr - a.dtr || a.name.localeCompare(b.name));

  const [teamCount, setTeamCount] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [arrangement, setArrangement] = useState<LineupRosterPlayer[]>([]);
  const [movingIndex, setMovingIndex] = useState<number | null>(null);

  const needed = teamCount * 4;

  // Starting fresh on a new club — render-time state adjustment, not an
  // effect, so no setState-in-effect cascade (same pattern used in RankingTable).
  const [prevClub, setPrevClub] = useState(club);
  if (club !== prevClub) {
    setPrevClub(club);
    setSelectedIds(new Set());
  }

  // Shrinking the team count below the current selection — trim down to the
  // new capacity, keeping the highest-DTR picks.
  const [prevTeamCount, setPrevTeamCount] = useState(teamCount);
  if (teamCount !== prevTeamCount) {
    setPrevTeamCount(teamCount);
    if (selectedIds.size > needed) {
      setSelectedIds(
        topDtrIds(
          sortedRoster.filter((p) => selectedIds.has(p.id)),
          needed,
        ),
      );
    }
  }

  // Whenever the actual set of selected players (or the team count) changes,
  // rebuild the arrangement fresh — manual swaps only persist until then.
  // Partial selections still render: teams fill in one player at a time
  // rather than waiting for a full quota.
  const selectionKey = `${Array.from(selectedIds).sort().join(",")}|${teamCount}`;
  const [prevSelectionKey, setPrevSelectionKey] = useState(selectionKey);
  if (selectionKey !== prevSelectionKey) {
    setPrevSelectionKey(selectionKey);
    setArrangement(
      buildTeams(
        sortedRoster.filter((p) => selectedIds.has(p.id)),
        teamCount,
      ).flatMap((t) => t.players),
    );
    setMovingIndex(null);
  }

  const legalTargets =
    movingIndex !== null ? new Set(legalTargetIndices(arrangement, movingIndex)) : null;

  function toggle(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        if (next.size >= needed) return prev;
        next.add(id);
      }
      return next;
    });
  }

  function clickPlayer(index: number) {
    if (movingIndex === null) {
      setMovingIndex(index);
    } else if (index === movingIndex) {
      setMovingIndex(null);
    } else if (legalTargets?.has(index)) {
      setArrangement((prev) => movePlayer(prev, movingIndex, index));
      setMovingIndex(null);
    } else {
      setMovingIndex(index);
    }
  }

  return (
    <div className="flex flex-col gap-4 rounded-md border p-4">
      <div>
        <h2 className="font-semibold">Lineup Builder</h2>
        <p className="text-muted-foreground text-xs">{club}</p>
      </div>

      <label className="flex items-center gap-2 text-sm">
        Number of teams
        <span className="flex items-center gap-1">
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            disabled={teamCount <= 1}
            onClick={() => setTeamCount((n) => clampTeamCount(n - 1))}
            aria-label="Fewer teams"
          >
            <Minus />
          </Button>
          <input
            type="number"
            min={1}
            max={MAX_TEAMS}
            value={teamCount}
            onChange={(e) => setTeamCount(clampTeamCount(Number(e.target.value) || 1))}
            className="border-input bg-background w-12 rounded-md border px-2 py-1 text-center"
          />
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            disabled={teamCount >= MAX_TEAMS}
            onClick={() => setTeamCount((n) => clampTeamCount(n + 1))}
            aria-label="More teams"
          >
            <Plus />
          </Button>
        </span>
      </label>

      <div>
        <p className="text-muted-foreground mb-1 text-xs">
          {selectedIds.size} of {needed} players selected
        </p>
        <div className="max-h-64 overflow-y-auto rounded-md border">
          <ul className="divide-y">
            {sortedRoster.map((p) => (
              <li key={p.id} className="flex items-center gap-2 px-2 py-1.5 text-sm">
                <input
                  type="checkbox"
                  checked={selectedIds.has(p.id)}
                  onChange={() => toggle(p.id)}
                  aria-label={`Include ${p.name}`}
                />
                <span className="flex-1 truncate">{p.name}</span>
                {p.isKader && (
                  <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-900 dark:bg-amber-950 dark:text-amber-200">
                    Kader
                  </span>
                )}
                {p.isYouth && (
                  <span className="bg-muted text-muted-foreground rounded-full px-1.5 py-0.5 text-[10px]">
                    Youth
                  </span>
                )}
                <span className="text-muted-foreground w-12 text-right tabular-nums">{p.dtr}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {arrangement.length > 0 ? (
        <div>
          <p className="text-muted-foreground mb-2 text-xs">
            {movingIndex === null
              ? "Click a player to see where they could legally move."
              : "Click a highlighted spot to move them there, or click them again to cancel."}
          </p>
          <div className="flex flex-col">
            {Array.from({ length: Math.ceil(arrangement.length / 4) }, (_, teamIndex) => (
              <div key={teamIndex} className={teamIndex > 0 ? "mt-3 border-t-2 pt-3" : ""}>
                <p className="text-muted-foreground mb-1 text-xs font-medium uppercase">
                  Team {teamIndex + 1}
                </p>
                {arrangement.slice(teamIndex * 4, teamIndex * 4 + 4).map((p, slotIndex) => {
                  const i = teamIndex * 4 + slotIndex;
                  const isMoving = i === movingIndex;
                  const isLegalTarget = legalTargets?.has(i) ?? false;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => clickPlayer(i)}
                      className={
                        "flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm " +
                        (isMoving
                          ? "bg-foreground text-background"
                          : isLegalTarget
                            ? "bg-emerald-100 hover:bg-emerald-200 dark:bg-emerald-950 dark:hover:bg-emerald-900"
                            : "hover:bg-accent hover:text-accent-foreground")
                      }
                    >
                      <span className="flex min-w-0 flex-1 items-center gap-1.5">
                        <span className="truncate">{p.name}</span>
                        {p.isKader && (
                          <span className="shrink-0 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-900 dark:bg-amber-950 dark:text-amber-200">
                            Kader
                          </span>
                        )}
                        {p.isYouth && (
                          <span className="bg-muted text-muted-foreground shrink-0 rounded-full px-1.5 py-0.5 text-[10px]">
                            Youth
                          </span>
                        )}
                      </span>
                      <span className="ml-2 shrink-0 tabular-nums opacity-70">{p.dtr}</span>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <p className="text-muted-foreground text-sm">
          Check players below to start building teams.
        </p>
      )}
    </div>
  );
}
