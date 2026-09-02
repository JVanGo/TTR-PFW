import { AGE_CATEGORIES } from "@/lib/import/age-categories";

export interface Finding {
  category: string;
  detail: string;
}

export interface PlayerRow {
  id: string;
  name: string;
  nameKey: string;
  club: string | null;
  class: string | null;
  ageCategory: string | null;
}

const YOUTH_CATEGORIES = new Set<string>(AGE_CATEGORIES);

/**
 * Rough "does this look like the same name" signal for the identity-mismatch
 * check below — not exact matching (name_key already handles that, this is
 * for typos/renames that dodge it). Not used anywhere performance-sensitive:
 * only compared within one season's small new-vs-departed player pools.
 */
export function levenshtein(a: string, b: string): number {
  const dp: number[] = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const temp = dp[j];
      dp[j] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, dp[j], dp[j - 1]);
      prev = temp;
    }
  }
  return dp[b.length];
}

/**
 * Flags "new" players (no prior-season DTR — see previousSeasonLabel in
 * ttr-simulation-io.ts) worth a manual look before trusting their beginner
 * starting rating: one whose name+club resembles a player who dropped off
 * last season's roster (their carry-forward match may have silently
 * failed), and one whose FLTT class isn't the expected beginner default for
 * their age group (D3 youth / D2 adult) even though they're being treated
 * as a first-timer.
 */
export function newPlayerChecks(
  playersById: Map<string, PlayerRow>,
  currentSeasonPlayerIds: Set<string>,
  priorSeasonPlayerIds: Set<string>,
): Finding[] {
  const findings: Finding[] = [];

  const newIds = [...currentSeasonPlayerIds].filter((id) => !priorSeasonPlayerIds.has(id));
  const departed = [...priorSeasonPlayerIds]
    .filter((id) => !currentSeasonPlayerIds.has(id))
    .map((id) => playersById.get(id))
    .filter((p): p is PlayerRow => p != null);

  for (const id of newIds) {
    const player = playersById.get(id);
    if (!player) continue;

    const exactKeyMatch = departed.find(
      (d) => d.nameKey === player.nameKey && (d.club ?? "") === (player.club ?? ""),
    );
    if (exactKeyMatch) {
      findings.push({
        category: "New player has the exact same name+club as a player missing this season",
        detail:
          `${player.name} (${player.club ?? "no club"}) — likely the same person under two ` +
          `different player rows (id ${exactKeyMatch.id} vs ${player.id}); carry-forward would ` +
          `have silently reset them to a beginner rating instead of their real DTR`,
      });
    } else {
      const closeMatch = departed.find(
        (d) =>
          d.club != null &&
          d.club === player.club &&
          d.nameKey !== player.nameKey &&
          levenshtein(d.nameKey, player.nameKey) <= 2,
      );
      if (closeMatch) {
        findings.push({
          category: "New player's name closely resembles a departed player at the same club",
          detail:
            `${player.name} vs ${closeMatch.name} (${player.club ?? "no club"}) — worth checking ` +
            `these aren't the same person (rename/typo breaking carry-forward)`,
        });
      }
    }

    const isYouth = player.ageCategory != null && YOUTH_CATEGORIES.has(player.ageCategory);
    const expectedClass = isYouth ? "D3" : "D2";
    if (player.class != null && player.class !== expectedClass) {
      findings.push({
        category: "New player's class isn't the expected beginner default",
        detail:
          `${player.name} (${player.club ?? "no club"}) — class ${player.class}, expected ` +
          `${expectedClass} for ${isYouth ? `a youth (${player.ageCategory})` : "an adult"}`,
      });
    }
  }

  return findings;
}
