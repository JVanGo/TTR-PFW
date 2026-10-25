import type { SupabaseClient } from "@supabase/supabase-js";
import { unstable_cache } from "next/cache";
import { fetchAllRows } from "@/lib/supabase/fetchAll";
import { fetchLatestTtrByPlayer, fetchTtrAsOfByPlayer } from "@/lib/supabase/latestTtr";
import { fetchLatestSnapshot } from "@/lib/verbandsrangliste";
import { createPublicClient } from "@/lib/supabase/public";
import { estimateTtr, isPlayerClass, type PlayerClass } from "@/lib/conversions";
import { klassierungForDtr, type Klassierung } from "@/lib/klassierung";
import { AGE_CATEGORIES, type AgeCategory } from "@/lib/age-categories";
import {
  ersteinstufungFor,
  isMatchInactive as computeIsMatchInactive,
} from "@/lib/import/ttr-simulation";
import { RETURNING_PLAYER_PFW_OVERRIDES } from "@/lib/import/season-start-overrides";
import { previousSeasonLabel } from "@/lib/season";
import { nameKey } from "@/lib/name-key";
import { identityKey } from "@/lib/identity-key";

function isAgeCategory(value: string | null): value is AgeCategory {
  return value != null && (AGE_CATEGORIES as readonly string[]).includes(value);
}

/** Tag used to invalidate the cached ranking after an admin edit or import. */
export const RANKING_CACHE_TAG = "ranking";

export const CURRENT_SEASON = "2026-2027";

export interface RankingRow {
  id: string;
  rank: number;
  name: string;
  club: string | null;
  /** No rated match in 24+ months (see DëschTennisRating.pdf's Inaktivitätsabzug) — always false for youth players, who are exempt. */
  isMatchInactive: boolean;
  dtr: number;
  klassierung: Klassierung;
  /** Non-null age_category (youth per the PDF's Ersteinstufung categories) — used by the Lineup Builder. */
  isYouth: boolean;
  isKader: boolean;
  /** The raw age category behind `isYouth`, or null for an adult — used by the Lineup Builder's competition age-eligibility filter. */
  ageCategory: AgeCategory | null;
  /** DTR on the newest Verbandsrangliste snapshot this season, or null if not on it — used by the Lineup Builder's NL teams. */
  snapshotDtr: number | null;
}

interface PlayerRow {
  id: string;
  name: string;
  name_key: string;
  class: string;
  pfw: number;
  club: string | null;
  is_active: boolean;
  classement_points: number | null;
  age_category: string | null;
  is_kader: boolean;
  last_match_date: string | null;
}

/**
 * The one place a player's current DTR is computed: their latest simulated
 * rating this season; or, if they haven't played yet this season, their own
 * settled final rating from the season immediately prior (matches.player_id
 * already IS this table's own id, so this needs none of the R2 identity
 * resolution the season simulation does for the same lookup); or, failing
 * that too (no prior-season history at all), the season-starting rating
 * that seeds the simulation for everyone. Both `/ranking` and the player
 * profile page read from here so the numbers shown always agree.
 *
 * With `asOfIso`, computes the DTR as it stood at the end of that day
 * instead (see fetchTtrAsOfByPlayer), for taking the Verbandsrangliste
 * snapshot; `snapshotDtr` is then left null.
 */
export async function computeRankingRows(
  supabase: SupabaseClient,
  asOfIso?: string,
): Promise<RankingRow[]> {
  const [allPlayers, latestTtrByPlayer, snapshot] = await Promise.all([
    fetchAllRows<PlayerRow>(
      supabase,
      "players",
      "id, name, name_key, class, pfw, club, is_active, classement_points, age_category, is_kader, last_match_date",
    ),
    asOfIso
      ? fetchTtrAsOfByPlayer(supabase, CURRENT_SEASON, asOfIso)
      : fetchLatestTtrByPlayer(supabase, CURRENT_SEASON),
    asOfIso ? null : fetchLatestSnapshot(supabase, CURRENT_SEASON),
  ]);
  // Run sequentially, not alongside the two fetches above — each side of
  // fetchLatestTtrByPlayer already fans out its own capped-concurrency page
  // fetches, and running two of those full-table scans at once (this one
  // over a whole prior, closed season is much bigger than the current
  // season's) was enough to blow past Postgres's statement timeout.
  const priorSeasonTtrByPlayer = await fetchLatestTtrByPlayer(
    supabase,
    previousSeasonLabel(CURRENT_SEASON),
  );

  // A player who's dropped off FLTT's own official ranking list is excluded
  // from the ranking entirely (not just badged) — filtered out here, before
  // ranks are assigned, so remaining players' rank numbers have no gaps.
  const players = allPlayers.filter((p) => p.is_active);
  const todayIso = new Date().toISOString().slice(0, 10);

  // Matched by name+club, not flttPlayerId — this file deliberately stays
  // Mongo-free (it's on the hot path for every page load), so it can't do
  // the simulation's own flttPlayerId resolution. Only matters for a
  // returning player who hasn't played any matches yet this season; once
  // they have, their simulated rating (fed by this same override, see
  // ttr-simulation-io.ts) takes over via latestTtrByPlayer above.
  const returningPfwOverrideByIdentity = new Map(
    RETURNING_PLAYER_PFW_OVERRIDES.map((o) => [identityKey(nameKey(o.name), o.club), o.pfw]),
  );

  const withDtr = players.map((p) => {
    const kl: PlayerClass = isPlayerClass(p.class) ? p.class : "D3";
    const ageCategory = isAgeCategory(p.age_category) ? p.age_category : null;
    const effectivePfw =
      returningPfwOverrideByIdentity.get(identityKey(p.name_key, p.club)) ?? Number(p.pfw);
    const seasonStart = estimateTtr(effectivePfw, kl, p.classement_points);

    let dtr: number;
    if (latestTtrByPlayer.has(p.id)) {
      dtr = latestTtrByPlayer.get(p.id)!;
    } else if (priorSeasonTtrByPlayer.has(p.id)) {
      dtr = priorSeasonTtrByPlayer.get(p.id)!;
    } else if (seasonStart != null) {
      dtr = seasonStart;
    } else if (kl === "D3") {
      // No classement points on file and never promoted past D3 — a true
      // beginner, with nothing to go on but their age bracket's own
      // starting point.
      dtr = ersteinstufungFor(ageCategory);
    } else {
      // Already placed above D3 by FLTT, just missing a points value in our
      // data — use that class's own zero-point anchor rather than guessing
      // a beginner's rating for someone who plainly isn't one.
      dtr = estimateTtr(effectivePfw, kl, 0)!;
    }

    return {
      id: p.id,
      name: p.name,
      club: p.club,
      isMatchInactive: ageCategory == null && computeIsMatchInactive(p.last_match_date, todayIso),
      dtr,
      klassierung: klassierungForDtr(dtr),
      isYouth: ageCategory != null,
      isKader: p.is_kader,
      ageCategory,
      snapshotDtr: snapshot?.dtrByPlayer.get(p.id) ?? null,
    };
  });

  withDtr.sort((a, b) => {
    if (b.dtr !== a.dtr) return b.dtr - a.dtr;
    return a.name.localeCompare(b.name);
  });

  return withDtr.map((p, i) => ({ ...p, rank: i + 1 }));
}

/**
 * Scanning every player and every match to build the ranking is expensive
 * (~2,200 players, ~80k match rows) and was previously redone from scratch
 * on every visit to the Home, Ranking, and Player pages — the main cause of
 * the site feeling slow. The data barely changes (an admin edit, an import,
 * or an out-of-band season re-simulation), so it's cached for 5 minutes and
 * invalidated immediately on admin writes via `RANKING_CACHE_TAG`.
 *
 * Cache key has a "-v3" suffix (bumped from "-v2" when `snapshotDtr` was
 * added, 2026-10-25): the "-v1" entry was found (2026-09-12)
 * serving `ageCategory`-less rows on production many hours after that field
 * was added to this function — Vercel's Data Cache persists across
 * deployments by design, and its 5-minute `revalidate` evidently never
 * actually re-ran for this key in practice. Bump this suffix again if this
 * ever recurs (a shape change to RankingRow that a live check doesn't
 * reflect within a few minutes).
 */
export const getRankingRows = unstable_cache(
  async (): Promise<RankingRow[]> => computeRankingRows(createPublicClient()),
  ["ranking-rows-v3"],
  { revalidate: 300, tags: [RANKING_CACHE_TAG] },
);
