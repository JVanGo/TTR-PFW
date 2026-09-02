/**
 * Read-only audit of a season's `matches` data against PRODUCTION Supabase.
 * Makes no writes anywhere — safe to run any time, as often as you like.
 *
 * Three independent checks:
 *
 * 1. Recompute vs. stored: re-runs the exact same simulation the real
 *    import script uses (computeSeasonSimulation — same code path as
 *    simulate-season-ttr-prod.ts, minus the delete+insert) and diffs the
 *    result against what's actually stored. Any difference means prod is
 *    out of date relative to today's code/data (expected right after a code
 *    fix, worth investigating otherwise).
 *
 * 2. Structural sanity checks on the stored rows themselves: things that
 *    should always hold regardless of input data — valid K-factors, a win
 *    never having a negative point change (and vice versa), a day's matches
 *    all settling to the same rating, opponent symmetry, and so on. These
 *    catch a different class of bug than #1 (e.g. a formula mistake that's
 *    consistent between the two runs, or a manual DB edit made outside the
 *    pipeline).
 *
 * 3. New-player sanity checks (most useful right at a season rollover, see
 *    project-ttr-season-rollover): a player who has no prior-season DTR is
 *    "new" for our purposes and gets an Ersteinstufung-style flat starting
 *    rating. Two things worth a human's eyes before trusting that:
 *      a. A "new" player whose name+club closely matches a player who was
 *         active last season but is missing from this one — carry-forward
 *         is keyed on our own player_id, so a rename/club-transfer/catalog
 *         hiccup that breaks that match silently resets a returning player
 *         to a beginner rating instead of carrying their real DTR forward.
 *      b. A "new" player whose FLTT class isn't the expected beginner
 *         default (D2 for adults, D3 for youth) — see the D3 special case
 *         in ttr-simulation-io.ts. A genuine first-timer placed in a higher
 *         class either got misclassified as new (case a) or the starting
 *         estimate silently used that class's own anchor instead of the
 *         flat beginner default, which may not be what's intended.
 *    Both are heuristics for manual review, not proof of a bug — expect
 *    noise on a season with no prior-season data at all (e.g. the very
 *    first tracked season), where "new" just means "first time we saw
 *    them," not "actually a beginner."
 *
 * None of these checks can tell you a player's season-START rating is
 * correct against the real world — that still needs a manual spot-check
 * against FLTT's own export/PDF, same as before.
 *
 * Reads credentials from .env.prod-seed (gitignored, manually populated),
 * same as the other -prod scripts. Refuses to run unless the URL contains
 * "supabase.co".
 *
 * Usage (PowerShell):
 *   npx tsx scripts/audit-season-prod.ts [season-label]
 *   # e.g. npx tsx scripts/audit-season-prod.ts 2025-2026
 *   # defaults to the current season (SEASON_LABEL) if omitted
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import process from "node:process";

import {
  computeSeasonSimulation,
  previousSeasonLabel,
  SEASON_LABEL,
} from "../lib/import/ttr-simulation-io";
import type { OutputMatchRow } from "../lib/import/ttr-simulation";
import { fetchLatestTtrByPlayer } from "../lib/supabase/latestTtr";
import { newPlayerChecks, type Finding, type PlayerRow } from "../lib/import/new-player-checks";

config({ path: ".env.prod-seed" });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SEASON = process.argv[2] ?? SEASON_LABEL;

if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.prod-seed");
  process.exit(1);
}
if (!/\.supabase\.co/.test(SUPABASE_URL)) {
  console.error(
    `Refusing: this script only runs against a cloud Supabase URL. Got: ${SUPABASE_URL}`,
  );
  process.exit(1);
}
if (!process.env.MONGODB_URI || !process.env.MONGODB_DB_NAME) {
  console.error("Missing MONGODB_URI or MONGODB_DB_NAME in .env.prod-seed");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

interface StoredMatchRow {
  id: string;
  player_id: string;
  match_date: string;
  competition: string;
  opponent_name: string;
  opponent_player_id: string | null;
  opponent_ttr: number | null;
  score: string | null;
  result: "W" | "L" | "FF";
  ttr_delta: number;
  new_ttr: number;
  k_factor: number | null;
  k_age_bonus: number | null;
  k_is_newcomer_bonus: boolean | null;
  k_is_returning_bonus: boolean | null;
}

async function fetchStoredMatches(
  supabase: SupabaseClient,
  season: string,
): Promise<StoredMatchRow[]> {
  const pageSize = 1000;
  const out: StoredMatchRow[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from("matches")
      .select(
        "id, player_id, match_date, competition, opponent_name, opponent_player_id, opponent_ttr, score, result, ttr_delta, new_ttr, k_factor, k_age_bonus, k_is_newcomer_bonus, k_is_returning_bonus",
      )
      .eq("season", season)
      .order("match_date", { ascending: true })
      .order("created_at", { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw new Error(`fetchStoredMatches: ${error.message}`);
    if (!data || data.length === 0) break;
    out.push(...(data as StoredMatchRow[]));
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return out;
}

/** Identifies "the same match row" across a fresh recompute and what's stored — matches table has no stable key across re-runs (ids are regenerated on every write). */
function diffKey(row: {
  playerId: string;
  matchDate: string;
  competition: string;
  opponentName: string | null;
  score: string | null;
  result: string;
}): string {
  return [
    row.playerId,
    row.matchDate,
    row.competition,
    row.opponentName ?? "",
    row.score ?? "",
    row.result,
  ].join("|");
}

const VALID_K_FACTORS = new Set([16, 20, 24, 28, 32]);
const PLACEMENT_BONUS_BY_LABEL: Record<string, number> = {
  "1st": 15,
  "2nd": 10,
  "3rd": 5,
};

function structuralChecks(rows: StoredMatchRow[], nameById: Map<string, string>): Finding[] {
  const findings: Finding[] = [];
  const playerName = (id: string) => nameById.get(id) ?? id;
  const describe = (r: StoredMatchRow) =>
    `${playerName(r.player_id)} — ${r.match_date} — ${r.competition} — vs ${r.opponent_name}`;

  const byDuplicateKey = new Map<string, StoredMatchRow[]>();
  const byPlayerDay = new Map<string, StoredMatchRow[]>();
  const byMirrorKey = new Map<string, StoredMatchRow>();

  for (const r of rows) {
    const isGrowthBonus = r.competition === "Nachwuchs-Spielstärkezuwachs";
    const isFloorReset = r.competition === "Ersteinstufung-Mindestwert";
    const isInactivityDeduction = r.competition === "Inaktivitätsabzug";
    const isPlacement = r.opponent_name.startsWith("Tournament — ");
    const isForfeit = r.result === "FF";
    const isRegularMatch =
      !isGrowthBonus && !isFloorReset && !isInactivityDeduction && !isPlacement && !isForfeit;

    if (isForfeit) {
      if (r.ttr_delta !== 0) {
        findings.push({
          category: "Forfeit with a non-zero point change",
          detail: `${describe(r)} — Δ=${r.ttr_delta}`,
        });
      }
      if (r.k_factor != null) {
        findings.push({ category: "Forfeit has a K-factor set", detail: describe(r) });
      }
      if (
        r.k_age_bonus != null ||
        r.k_is_newcomer_bonus != null ||
        r.k_is_returning_bonus != null
      ) {
        findings.push({ category: "Forfeit has a K-factor breakdown set", detail: describe(r) });
      }
    } else if (isRegularMatch) {
      if (r.k_factor == null || !VALID_K_FACTORS.has(r.k_factor)) {
        findings.push({ category: "Invalid K-factor", detail: `${describe(r)} — K=${r.k_factor}` });
      }
      if (r.k_age_bonus == null || ![0, 4, 8].includes(r.k_age_bonus)) {
        findings.push({
          category: "Invalid K-factor age bonus",
          detail: `${describe(r)} — age bonus=${r.k_age_bonus}`,
        });
      } else if (
        r.k_factor != null &&
        16 + r.k_age_bonus + (r.k_is_newcomer_bonus ? 4 : 0) + (r.k_is_returning_bonus ? 4 : 0) !==
          r.k_factor
      ) {
        findings.push({
          category: "K-factor breakdown doesn't add up to the K-factor",
          detail: `${describe(r)} — K=${r.k_factor}, age=${r.k_age_bonus}, newcomer=${r.k_is_newcomer_bonus}, returning=${r.k_is_returning_bonus}`,
        });
      }
      if (r.result === "W" && r.ttr_delta < 0) {
        findings.push({ category: "Win with a negative point change", detail: describe(r) });
      }
      if (r.result === "L" && r.ttr_delta > 0) {
        findings.push({ category: "Loss with a positive point change", detail: describe(r) });
      }
      if (r.k_factor != null && Math.abs(r.ttr_delta) > r.k_factor) {
        findings.push({
          category: "Point change larger than the K-factor allows",
          detail: `${describe(r)} — Δ=${r.ttr_delta}, K=${r.k_factor}`,
        });
      }
      if (r.opponent_ttr == null) {
        findings.push({
          category: "Graded match with no opponent rating recorded",
          detail: describe(r),
        });
      }
    } else if (isGrowthBonus) {
      if (r.ttr_delta !== 12) {
        findings.push({
          category: "Youth growth bonus isn't exactly +12",
          detail: `${describe(r)} — Δ=${r.ttr_delta}`,
        });
      }
      if (r.k_factor != null) {
        findings.push({ category: "Youth growth bonus has a K-factor set", detail: describe(r) });
      }
      if (
        r.k_age_bonus != null ||
        r.k_is_newcomer_bonus != null ||
        r.k_is_returning_bonus != null
      ) {
        findings.push({
          category: "Youth growth bonus has a K-factor breakdown set",
          detail: describe(r),
        });
      }
    } else if (isFloorReset) {
      if (r.ttr_delta <= 0) {
        findings.push({
          category: "Ersteinstufung floor-reset isn't a positive point change",
          detail: `${describe(r)} — Δ=${r.ttr_delta}`,
        });
      }
      if (r.result !== "W") {
        findings.push({
          category: "Ersteinstufung floor-reset isn't recorded as a win",
          detail: describe(r),
        });
      }
      if (r.k_factor != null) {
        findings.push({
          category: "Ersteinstufung floor-reset has a K-factor set",
          detail: describe(r),
        });
      }
      if (
        r.k_age_bonus != null ||
        r.k_is_newcomer_bonus != null ||
        r.k_is_returning_bonus != null
      ) {
        findings.push({
          category: "Ersteinstufung floor-reset has a K-factor breakdown set",
          detail: describe(r),
        });
      }
    } else if (isInactivityDeduction) {
      if (r.ttr_delta >= 0 || ![-80, -20, -100, -120].includes(r.ttr_delta)) {
        findings.push({
          category: "Inactivity deduction isn't one of the valid amounts",
          detail: `${describe(r)} — Δ=${r.ttr_delta}`,
        });
      }
      if (r.result !== "L") {
        findings.push({
          category: "Inactivity deduction isn't recorded as a loss",
          detail: describe(r),
        });
      }
      if (r.k_factor != null) {
        findings.push({ category: "Inactivity deduction has a K-factor set", detail: describe(r) });
      }
      if (
        r.k_age_bonus != null ||
        r.k_is_newcomer_bonus != null ||
        r.k_is_returning_bonus != null
      ) {
        findings.push({
          category: "Inactivity deduction has a K-factor breakdown set",
          detail: describe(r),
        });
      }
    } else if (isPlacement) {
      const label = Object.keys(PLACEMENT_BONUS_BY_LABEL).find((l) => r.opponent_name.includes(l));
      const expected = label ? PLACEMENT_BONUS_BY_LABEL[label] : null;
      if (expected != null && r.ttr_delta !== expected) {
        findings.push({
          category: "Tournament placement bonus doesn't match its label",
          detail: `${describe(r)} — Δ=${r.ttr_delta}, expected ${expected}`,
        });
      }
      if (r.k_factor != null) {
        findings.push({
          category: "Tournament placement bonus has a K-factor set",
          detail: describe(r),
        });
      }
      if (
        r.k_age_bonus != null ||
        r.k_is_newcomer_bonus != null ||
        r.k_is_returning_bonus != null
      ) {
        findings.push({
          category: "Tournament placement bonus has a K-factor breakdown set",
          detail: describe(r),
        });
      }
    }

    if (r.new_ttr < 200 || r.new_ttr > 3000) {
      findings.push({
        category: "DTR far outside a plausible range",
        detail: `${describe(r)} — DTR=${r.new_ttr}`,
      });
    }

    // Placements are excluded: a player can legitimately place in up to two
    // categories at the same club tournament (see the PDF's Vereinsturniere
    // section), which produces two placement rows with identical displayed
    // fields — the category itself isn't in this table, so they're
    // indistinguishable here and would show up as a false-positive "duplicate".
    if (!isPlacement) {
      const dupKey = [
        r.player_id,
        r.match_date,
        r.competition,
        r.opponent_name,
        r.score ?? "",
        r.result,
      ].join("|");
      const dupList = byDuplicateKey.get(dupKey);
      if (dupList) dupList.push(r);
      else byDuplicateKey.set(dupKey, [r]);
    }

    if (!isGrowthBonus && !isFloorReset && !isInactivityDeduction) {
      const dayKey = `${r.player_id}|${r.match_date}`;
      const dayList = byPlayerDay.get(dayKey);
      if (dayList) dayList.push(r);
      else byPlayerDay.set(dayKey, [r]);
    }

    if (r.opponent_player_id) {
      const mirrorKey = `${r.player_id}|${r.opponent_player_id}|${r.match_date}|${r.competition}`;
      byMirrorKey.set(mirrorKey, r);
    }
  }

  for (const [, group] of byDuplicateKey) {
    if (group.length > 1) {
      findings.push({
        category: "Duplicate match rows",
        detail: `${describe(group[0])} — appears ${group.length} times`,
      });
    }
  }

  for (const [, group] of byPlayerDay) {
    const distinctTotals = new Set(group.map((r) => r.new_ttr));
    if (distinctTotals.size > 1) {
      findings.push({
        category: "A player's matches on the same day settled to different totals",
        detail: `${describe(group[0])} — totals: ${[...distinctTotals].join(", ")}`,
      });
    }
  }

  for (const r of rows) {
    if (!r.opponent_player_id) continue;
    const expectedMirrorKey = `${r.opponent_player_id}|${r.player_id}|${r.match_date}|${r.competition}`;
    const mirror = byMirrorKey.get(expectedMirrorKey);
    if (!mirror) {
      findings.push({
        category: "Tracked opponent has no matching row on their own side",
        detail: describe(r),
      });
    } else if (mirror.result === r.result && r.result !== "FF") {
      // Both sides legitimately show "FF" for a real forfeit — only a
      // matching W/W or L/L pair is a bug.
      findings.push({
        category: "Both sides of a match recorded the same result",
        detail: `${describe(r)} — both marked ${r.result}`,
      });
    }
  }

  return findings;
}

function diffAgainstComputed(computed: OutputMatchRow[], stored: StoredMatchRow[]): Finding[] {
  const computedByKey = new Map<string, OutputMatchRow[]>();
  for (const r of computed) {
    const key = diffKey({
      playerId: r.playerId,
      matchDate: r.matchDate,
      competition: r.competition,
      opponentName: r.opponentName,
      score: r.score,
      result: r.result,
    });
    const list = computedByKey.get(key);
    if (list) list.push(r);
    else computedByKey.set(key, [r]);
  }

  const storedByKey = new Map<string, StoredMatchRow[]>();
  for (const r of stored) {
    const key = diffKey({
      playerId: r.player_id,
      matchDate: r.match_date,
      competition: r.competition,
      opponentName: r.opponent_name,
      score: r.score,
      result: r.result,
    });
    const list = storedByKey.get(key);
    if (list) list.push(r);
    else storedByKey.set(key, [r]);
  }

  const findings: Finding[] = [];
  const allKeys = new Set([...computedByKey.keys(), ...storedByKey.keys()]);

  for (const key of allKeys) {
    const computedRows = computedByKey.get(key) ?? [];
    const storedRows = storedByKey.get(key) ?? [];

    if (computedRows.length === 0) {
      findings.push({
        category: "Stored row no longer produced by a fresh recompute",
        detail: `${key} — stored ${storedRows.length}×`,
      });
      continue;
    }
    if (storedRows.length === 0) {
      findings.push({
        category: "Freshly computed row missing from what's stored",
        detail: `${key} — computed ${computedRows.length}×`,
      });
      continue;
    }
    if (computedRows.length !== storedRows.length) {
      // Count itself differs — can't be a like-for-like field comparison.
      findings.push({
        category: "Ambiguous match (multiple rows share the same identifying details)",
        detail: `${key} — computed ${computedRows.length}×, stored ${storedRows.length}×`,
      });
      continue;
    }

    // Same count on both sides (1, or more — e.g. a player legitimately
    // placing in two tournament categories produces two identical-looking
    // placement rows). Compare as an unordered multiset of the fields that
    // matter rather than assuming array order pairs them up correctly.
    const signature = (c: {
      ttrDelta: number;
      newTtr: number;
      kFactor: number | null;
      kAgeBonus: number | null;
      kIsNewcomerBonus: boolean | null;
      kIsReturningBonus: boolean | null;
      opponentTtr: number | null;
    }) =>
      `${c.ttrDelta}|${c.newTtr}|${c.kFactor}|${c.kAgeBonus}|${c.kIsNewcomerBonus}|${c.kIsReturningBonus}|${c.opponentTtr}`;
    const computedSigs = computedRows
      .map((c) =>
        signature({
          ttrDelta: c.ttrDelta,
          newTtr: c.newTtr,
          kFactor: c.kFactor,
          kAgeBonus: c.kAgeBonus,
          kIsNewcomerBonus: c.kIsNewcomerBonus,
          kIsReturningBonus: c.kIsReturningBonus,
          opponentTtr: c.opponentTtr ?? null,
        }),
      )
      .sort();
    const storedSigs = storedRows
      .map((s) =>
        signature({
          ttrDelta: s.ttr_delta,
          newTtr: s.new_ttr,
          kFactor: s.k_factor,
          kAgeBonus: s.k_age_bonus,
          kIsNewcomerBonus: s.k_is_newcomer_bonus,
          kIsReturningBonus: s.k_is_returning_bonus,
          opponentTtr: s.opponent_ttr,
        }),
      )
      .sort();
    if (computedSigs.join(";") !== storedSigs.join(";")) {
      findings.push({
        category: "Stored row(s) differ from a fresh recompute",
        detail: `${key} — stored [${storedSigs.join(", ")}] vs recomputed [${computedSigs.join(", ")}]`,
      });
    }
  }

  return findings;
}

function printReport(title: string, findings: Finding[], sampleSize = 15) {
  if (findings.length === 0) {
    console.log(`✓ ${title}: nothing found.`);
    return;
  }
  const byCategory = new Map<string, Finding[]>();
  for (const f of findings) {
    const list = byCategory.get(f.category);
    if (list) list.push(f);
    else byCategory.set(f.category, [f]);
  }
  console.log(
    `⚠ ${title}: ${findings.length} finding(s) across ${byCategory.size} categor${byCategory.size === 1 ? "y" : "ies"}.`,
  );
  for (const [category, items] of byCategory) {
    console.log(`\n  ${category} (${items.length}):`);
    for (const item of items.slice(0, sampleSize)) {
      console.log(`    - ${item.detail}`);
    }
    if (items.length > sampleSize) {
      console.log(`    ... and ${items.length - sampleSize} more.`);
    }
  }
}

async function main() {
  console.log(`Target (PROD, read-only): ${SUPABASE_URL}`);
  console.log(`Season: ${SEASON}\n`);

  console.log("Loading players...");
  const playersById = new Map<string, PlayerRow>();
  {
    const pageSize = 1000;
    let from = 0;
    for (;;) {
      const { data, error } = await supabase
        .from("players")
        .select("id, name, name_key, club, class, age_category")
        .range(from, from + pageSize - 1);
      if (error) throw new Error(error.message);
      if (!data || data.length === 0) break;
      for (const p of data as {
        id: string;
        name: string;
        name_key: string;
        club: string | null;
        class: string | null;
        age_category: string | null;
      }[]) {
        playersById.set(p.id, {
          id: p.id,
          name: p.name,
          nameKey: p.name_key,
          club: p.club,
          class: p.class,
          ageCategory: p.age_category,
        });
      }
      if (data.length < pageSize) break;
      from += pageSize;
    }
  }
  const nameById = new Map([...playersById].map(([id, p]) => [id, p.name]));
  console.log(`  ${nameById.size} players.\n`);

  const priorSeason = previousSeasonLabel(SEASON);
  console.log(`Loading prior-season (${priorSeason}) DTRs for the new-player checks...`);
  const priorSeasonDtrByPlayerId = await fetchLatestTtrByPlayer(supabase, priorSeason);
  const priorSeasonPlayerIds = new Set(priorSeasonDtrByPlayerId.keys());
  console.log(`  ${priorSeasonPlayerIds.size} players carried a DTR from ${priorSeason}.\n`);

  console.log(
    "Recomputing the season from scratch (same code path as the real import, no writes)...",
  );
  const { matchRows: computed } = await computeSeasonSimulation(supabase, (msg) =>
    console.log(`  ${msg}`),
  );
  console.log(`  ${computed.length} rows recomputed.\n`);

  console.log(`Fetching what's actually stored for season ${SEASON}...`);
  const stored = await fetchStoredMatches(supabase, SEASON);
  console.log(`  ${stored.length} rows stored.\n`);

  console.log("=".repeat(72));
  printReport("Recompute vs. stored", diffAgainstComputed(computed, stored));
  console.log();
  console.log("=".repeat(72));
  printReport("Structural sanity checks", structuralChecks(stored, nameById));
  console.log();
  console.log("=".repeat(72));
  const currentSeasonPlayerIds = new Set(stored.map((r) => r.player_id));
  printReport(
    "New-player sanity checks",
    newPlayerChecks(playersById, currentSeasonPlayerIds, priorSeasonPlayerIds),
  );
  console.log();
  console.log("=".repeat(72));
  console.log(
    "\nNote: none of these checks verify a player's season-START rating against\n" +
      "the real world — that still needs a manual spot-check against FLTT's own\n" +
      "export or the DTR PDF, same as before.",
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
