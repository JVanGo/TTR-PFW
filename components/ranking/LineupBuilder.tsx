"use client";

import { useState } from "react";
import { ArrowUpDown, Lock } from "lucide-react";
import { buildTeams, canSwap, type LineupPlayer } from "@/lib/lineup";

export interface LineupRosterPlayer extends LineupPlayer {
  klassierung: string;
}

interface Props {
  club: string;
  roster: LineupRosterPlayer[];
}

const MAX_TEAMS = 10;

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
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => topDtrIds(sortedRoster, 4));
  const [arrangement, setArrangement] = useState<LineupRosterPlayer[]>(() =>
    buildTeams(
      sortedRoster.filter((p) => selectedIds.has(p.id)),
      1,
    ).flatMap((t) => t.players),
  );

  // Reset the selection default and arrangement whenever the club (roster) or
  // team count changes — render-time state adjustment, not an effect, so no
  // setState-in-effect cascade (same pattern used in RankingTable).
  const resetKey = `${club}|${teamCount}`;
  const [prevResetKey, setPrevResetKey] = useState(resetKey);
  if (resetKey !== prevResetKey) {
    setPrevResetKey(resetKey);
    const nextSelected = topDtrIds(sortedRoster, teamCount * 4);
    setSelectedIds(nextSelected);
    setArrangement(
      buildTeams(
        sortedRoster.filter((p) => nextSelected.has(p.id)),
        teamCount,
      ).flatMap((t) => t.players),
    );
  }

  // Whenever the actual set of selected players changes (a checkbox toggle),
  // re-sort fresh — manual swaps only persist until the roster changes again.
  const selectionKey = Array.from(selectedIds).sort().join(",");
  const [prevSelectionKey, setPrevSelectionKey] = useState(selectionKey);
  if (selectionKey !== prevSelectionKey) {
    setPrevSelectionKey(selectionKey);
    setArrangement(
      buildTeams(
        sortedRoster.filter((p) => selectedIds.has(p.id)),
        teamCount,
      ).flatMap((t) => t.players),
    );
  }

  const needed = teamCount * 4;
  const ready = selectedIds.size === needed && arrangement.length === needed;

  function toggle(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function swap(i: number, j: number) {
    setArrangement((prev) => {
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }

  return (
    <div className="flex flex-col gap-4 rounded-md border p-4">
      <div>
        <h2 className="font-semibold">Lineup Builder</h2>
        <p className="text-muted-foreground text-xs">{club}</p>
      </div>

      <label className="flex items-center gap-2 text-sm">
        Number of teams
        <input
          type="number"
          min={1}
          max={MAX_TEAMS}
          value={teamCount}
          onChange={(e) => {
            const n = Math.min(MAX_TEAMS, Math.max(1, Number(e.target.value) || 1));
            setTeamCount(n);
          }}
          className="border-input bg-background w-16 rounded-md border px-2 py-1"
        />
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

      {ready ? (
        <div className="flex flex-col">
          {Array.from({ length: teamCount }, (_, teamIndex) => (
            <div key={teamIndex}>
              <p className="text-muted-foreground mt-2 text-xs font-medium uppercase">
                Team {teamIndex + 1}
              </p>
              {arrangement.slice(teamIndex * 4, teamIndex * 4 + 4).map((p, slotIndex) => {
                const i = teamIndex * 4 + slotIndex;
                return (
                  <div key={p.id}>
                    <div className="flex items-center justify-between rounded-md px-2 py-1.5 text-sm">
                      <span className="truncate">{p.name}</span>
                      <span className="text-muted-foreground tabular-nums">{p.dtr}</span>
                    </div>
                    {i < arrangement.length - 1 && (
                      <SwapDivider
                        a={arrangement[i]}
                        b={arrangement[i + 1]}
                        sameTeam={slotIndex < 3}
                        onSwap={() => swap(i, i + 1)}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-muted-foreground text-sm">
          Select exactly {needed} player{needed === 1 ? "" : "s"} to build the lineup.
        </p>
      )}
    </div>
  );
}

function SwapDivider({
  a,
  b,
  sameTeam,
  onSwap,
}: {
  a: LineupPlayer;
  b: LineupPlayer;
  sameTeam: boolean;
  onSwap: () => void;
}) {
  const legal = canSwap(a, b, sameTeam);
  const gap = Math.abs(a.dtr - b.dtr);

  if (legal) {
    return (
      <button
        type="button"
        onClick={onSwap}
        title={`Gap of ${gap} DTR — within tolerance, can swap`}
        className="hover:bg-accent hover:text-accent-foreground flex w-full items-center gap-1.5 rounded-md px-2 py-0.5 text-xs"
      >
        <ArrowUpDown className="size-3" />
        can swap
      </button>
    );
  }

  return (
    <div
      title={`Gap of ${gap} DTR — exceeds the ${sameTeam ? "team" : "club-wide"} tolerance`}
      className="text-muted-foreground/60 flex items-center gap-1.5 px-2 py-0.5 text-xs"
    >
      <Lock className="size-3" />
      {gap} DTR gap — can&apos;t swap
    </div>
  );
}
