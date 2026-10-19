"use client";

import { useState } from "react";
import { Minus, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { buildTeams, legalTargetIndices, movePlayer, type LineupPlayer } from "@/lib/lineup";
import { AGE_CATEGORIES, type AgeCategory } from "@/lib/age-categories";
import type { Competition } from "@/lib/competitions";
import { Button } from "@/components/ui/button";

export interface LineupRosterPlayer extends LineupPlayer {
  klassierung: string;
}

interface Props {
  club: string;
  roster: LineupRosterPlayer[];
  competitions: Competition[];
  teamCountsByCompetition: Record<string, Record<string, number>>;
}

const MAX_TEAMS = 10;
const DEFAULT_TEAM_SIZE = 4;
/** Most clubs building a lineup are doing it for this — picked as the default competition instead of "Custom". */
const DEFAULT_COMPETITION_NAME = "Championnat Seniors";

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

/** Whether a player is young enough (or exactly) the competition's max age category. Adults (null ageCategory) never qualify for an age-restricted competition. */
function isEligibleForMaxAge(player: LineupRosterPlayer, maxAgeCategory: AgeCategory): boolean {
  if (player.ageCategory == null) return false;
  return AGE_CATEGORIES.indexOf(player.ageCategory) <= AGE_CATEGORIES.indexOf(maxAgeCategory);
}

/**
 * A fixed count always wins; otherwise prefill with the imported per-club
 * count for this competition, if one is known — falls back to whatever
 * count was already set (a no-op) rather than forcing back to 1.
 */
function resolveTeamCount(
  activeCompetition: Competition | null,
  club: string,
  teamCountsByCompetition: Record<string, Record<string, number>>,
  fallback: number,
): number {
  if (activeCompetition?.fixedTeamCount != null) return activeCompetition.fixedTeamCount;
  const known = activeCompetition
    ? teamCountsByCompetition[activeCompetition.id]?.[club]
    : undefined;
  return known ?? fallback;
}

/**
 * One entry per team, in order: `teamCount` normal teams at `baseSize`,
 * followed by `smallTrailingCount` additional teams one player smaller
 * (e.g. a club's Division 6 teams — those aren't part of the regular
 * imported team count at all, since Division 6 isn't in the FLTT document
 * that count comes from, so they're extra teams on top, not a re-sizing of
 * the club's existing ones).
 */
function computeTeamSizes(
  teamCount: number,
  baseSize: number,
  smallTrailingCount: number,
): number[] {
  const bigTeams = Array<number>(Math.max(teamCount, 0)).fill(baseSize);
  const smallTeams = Array<number>(Math.max(smallTrailingCount, 0)).fill(baseSize - 1);
  return [...bigTeams, ...smallTeams];
}

export function LineupBuilder({ club, roster, competitions, teamCountsByCompetition }: Props) {
  const t = useTranslations("LineupBuilder");
  const sortedRoster = [...roster].sort((a, b) => b.dtr - a.dtr || a.name.localeCompare(b.name));

  const defaultCompetition = competitions.find((c) => c.name === DEFAULT_COMPETITION_NAME) ?? null;

  const [teamCount, setTeamCount] = useState(() =>
    resolveTeamCount(defaultCompetition, club, teamCountsByCompetition, 1),
  );
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [arrangement, setArrangement] = useState<LineupRosterPlayer[]>([]);
  const [movingIndex, setMovingIndex] = useState<number | null>(null);
  const [selectedCompetitionId, setSelectedCompetitionId] = useState<string | null>(
    defaultCompetition?.id ?? null,
  );

  const activeCompetition = competitions.find((c) => c.id === selectedCompetitionId) ?? null;
  const smallTrailingCount = activeCompetition?.smallLastTeamCounts[club] ?? 0;
  const teamSizes = computeTeamSizes(
    teamCount,
    activeCompetition?.teamSize ?? DEFAULT_TEAM_SIZE,
    smallTrailingCount,
  );
  const needed = teamSizes.reduce((a, b) => a + b, 0);

  const eligibleRoster = activeCompetition?.maxAgeCategory
    ? sortedRoster.filter((p) => isEligibleForMaxAge(p, activeCompetition.maxAgeCategory!))
    : sortedRoster;
  const hiddenForAge = sortedRoster.length - eligibleRoster.length;

  // Starting fresh on a new club — render-time state adjustment, not an
  // effect, so no setState-in-effect cascade (same pattern used in RankingTable).
  const [prevClub, setPrevClub] = useState(club);
  if (club !== prevClub) {
    setPrevClub(club);
    setSelectedIds(new Set());
    setTeamCount((n) => resolveTeamCount(activeCompetition, club, teamCountsByCompetition, n));
  }

  // Switching competition — lock the team count to a fixed one if this
  // competition has one (or prefill it with a known per-club count),
  // and drop any current picks who no longer qualify under its age limit.
  const [prevCompetitionId, setPrevCompetitionId] = useState(selectedCompetitionId);
  if (selectedCompetitionId !== prevCompetitionId) {
    setPrevCompetitionId(selectedCompetitionId);
    setTeamCount((n) => resolveTeamCount(activeCompetition, club, teamCountsByCompetition, n));
    if (activeCompetition?.maxAgeCategory) {
      const maxAgeCategory = activeCompetition.maxAgeCategory;
      setSelectedIds((prev) => {
        const next = new Set<string>();
        for (const p of sortedRoster) {
          if (prev.has(p.id) && isEligibleForMaxAge(p, maxAgeCategory)) next.add(p.id);
        }
        return next;
      });
    }
  }

  // Shrinking the team count (or team sizes) below the current selection —
  // trim down to the new capacity, keeping the highest-DTR picks.
  const capacityKey = teamSizes.join(",");
  const [prevCapacityKey, setPrevCapacityKey] = useState(capacityKey);
  if (capacityKey !== prevCapacityKey) {
    setPrevCapacityKey(capacityKey);
    if (selectedIds.size > needed) {
      setSelectedIds(
        topDtrIds(
          eligibleRoster.filter((p) => selectedIds.has(p.id)),
          needed,
        ),
      );
    }
  }

  // Whenever the actual set of selected players (or the team sizes)
  // changes, rebuild the arrangement fresh — manual swaps only persist until
  // then. Partial selections still render: teams fill in one player at a
  // time rather than waiting for a full quota.
  const selectionKey = `${Array.from(selectedIds).sort().join(",")}|${capacityKey}`;
  const [prevSelectionKey, setPrevSelectionKey] = useState(selectionKey);
  if (selectionKey !== prevSelectionKey) {
    setPrevSelectionKey(selectionKey);
    setArrangement(
      buildTeams(
        eligibleRoster.filter((p) => selectedIds.has(p.id)),
        teamSizes,
      ).flatMap((team) => team.players),
    );
    setMovingIndex(null);
  }

  const legalTargets =
    movingIndex !== null ? new Set(legalTargetIndices(arrangement, movingIndex, teamSizes)) : null;

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
        <h2 className="font-semibold">{t("heading")}</h2>
        <p className="text-muted-foreground text-xs">{club}</p>
      </div>

      <label className="flex items-center gap-2 text-sm">
        {t("competition")}
        <select
          value={selectedCompetitionId ?? ""}
          onChange={(e) => setSelectedCompetitionId(e.target.value || null)}
          className="border-input bg-background min-w-0 flex-1 rounded-md border px-2 py-1"
        >
          <option value="">{t("customCompetition")}</option>
          {competitions.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>

      {activeCompetition?.fixedTeamCount != null ? (
        <p className="text-sm">
          {t("numberOfTeams")}: {t("fixedTeamCount", { count: teamCount })}
        </p>
      ) : (
        <label className="flex items-center gap-2 text-sm">
          {t("numberOfTeams")}
          <span className="flex items-center gap-1">
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              disabled={teamCount <= 1}
              onClick={() => setTeamCount((n) => clampTeamCount(n - 1))}
              aria-label={t("fewerTeams")}
            >
              <Minus />
            </Button>
            <input
              type="number"
              min={1 + smallTrailingCount}
              max={MAX_TEAMS}
              value={teamCount + smallTrailingCount}
              onChange={(e) =>
                setTeamCount(clampTeamCount((Number(e.target.value) || 1) - smallTrailingCount))
              }
              className="border-input bg-background w-12 rounded-md border px-2 py-1 text-center"
            />
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              disabled={teamCount + smallTrailingCount >= MAX_TEAMS}
              onClick={() => setTeamCount((n) => clampTeamCount(n + 1))}
              aria-label={t("moreTeams")}
            >
              <Plus />
            </Button>
          </span>
        </label>
      )}

      <div>
        <p className="text-muted-foreground mb-1 text-xs">
          {t("selectedCount", { selected: selectedIds.size, needed })}
        </p>
        {hiddenForAge > 0 && (
          <p className="text-muted-foreground mb-1 text-xs">
            {t("ineligibleHidden", { count: hiddenForAge })}
          </p>
        )}
        <div className="max-h-64 overflow-y-auto rounded-md border">
          <ul className="divide-y">
            {eligibleRoster.map((p) => (
              <li key={p.id} className="flex items-center gap-2 px-2 py-1.5 text-sm">
                <input
                  type="checkbox"
                  checked={selectedIds.has(p.id)}
                  onChange={() => toggle(p.id)}
                  aria-label={t("includePlayer", { name: p.name })}
                />
                <span className="min-w-0 flex-1">{p.name}</span>
                {p.isYouth && (
                  <span className="bg-muted text-muted-foreground rounded-full px-1.5 py-0.5 text-[10px]">
                    {t("youthBadge")}
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
            {movingIndex === null ? t("clickToMove") : t("clickHighlighted")}
          </p>
          <div className="flex flex-col">
            {teamSizes.map((size, teamIndex) => {
              const start = teamSizes.slice(0, teamIndex).reduce((a, b) => a + b, 0);
              return (
                <div key={teamIndex} className={teamIndex > 0 ? "mt-3 border-t-2 pt-3" : ""}>
                  <p className="text-muted-foreground mb-1 text-xs font-medium uppercase">
                    {t("team", { number: teamIndex + 1 })}
                  </p>
                  {arrangement.slice(start, start + size).map((p, slotIndex) => {
                    const i = start + slotIndex;
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
                        <span className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
                          <span className="min-w-0">{p.name}</span>
                          {p.isYouth && (
                            <span className="bg-muted text-muted-foreground shrink-0 rounded-full px-1.5 py-0.5 text-[10px]">
                              {t("youthBadge")}
                            </span>
                          )}
                        </span>
                        <span className="ml-2 shrink-0 tabular-nums opacity-70">{p.dtr}</span>
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <p className="text-muted-foreground text-sm">{t("checkPlayers")}</p>
      )}
    </div>
  );
}
