/**
 * Take the Verbandsrangliste snapshot (every active player's DTR frozen at
 * the start of a Teilrunde: 1 Aug / 1 Jan) for the current season against
 * PRODUCTION Supabase. NL teams in the Lineup Builder line up by it.
 *
 * By default, snapshots the latest Teilrunde whose date has arrived, and
 * only if no snapshot exists for it yet — so it's safe to run every week
 * (the weekly results update does, right after recalculating ratings). The
 * DTR is worked out as it stood at the end of the snapshot date, from the
 * stored match history (see computeRankingRows' `asOfIso`).
 *
 * Reads credentials from .env.prod-seed (gitignored, manually populated).
 * Refuses to run unless the URL contains "supabase.co" (cloud) AND the user
 * confirms by setting CONFIRM=YES in the environment.
 *
 * Usage (PowerShell):
 *   $env:CONFIRM = "YES"
 *   npx tsx scripts/take-verbandsrangliste-snapshot-prod.ts
 *   npx tsx scripts/take-verbandsrangliste-snapshot-prod.ts --teilrunde 1 --force   # retake on purpose
 */

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import process from "node:process";

import { computeRankingRows, CURRENT_SEASON } from "../lib/ranking";
import { currentTeilrunde, snapshotDateFor, type Teilrunde } from "../lib/verbandsrangliste";

config({ path: ".env.prod-seed" });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const CONFIRM = process.env.CONFIRM;

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
if (CONFIRM !== "YES") {
  console.error(
    `Refusing without explicit confirmation. Re-run with CONFIRM=YES set in the environment.`,
  );
  console.error(`Target: ${SUPABASE_URL}`);
  process.exit(1);
}

const args = process.argv.slice(2);
const force = args.includes("--force");
const teilrundeArg = args.includes("--teilrunde")
  ? Number(args[args.indexOf("--teilrunde") + 1])
  : null;
if (teilrundeArg != null && teilrundeArg !== 1 && teilrundeArg !== 2) {
  console.error("--teilrunde must be 1 or 2");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  console.log(`Target (PROD): ${SUPABASE_URL}`);
  const todayIso = new Date().toISOString().slice(0, 10);
  const teilrunde =
    (teilrundeArg as Teilrunde | null) ?? currentTeilrunde(CURRENT_SEASON, todayIso);
  if (teilrunde == null) {
    console.log(`No Teilrunde of ${CURRENT_SEASON} has started yet — nothing to do.`);
    return;
  }
  const asOfIso = snapshotDateFor(CURRENT_SEASON, teilrunde);
  if (asOfIso > todayIso) {
    console.error(`Teilrunde ${teilrunde} starts ${asOfIso}, which hasn't arrived yet.`);
    process.exit(1);
  }

  const { count, error: countError } = await supabase
    .from("verbandsrangliste_snapshots")
    .select("id", { count: "exact", head: true })
    .eq("season", CURRENT_SEASON)
    .eq("teilrunde", teilrunde);
  if (countError) throw new Error(countError.message);
  if ((count ?? 0) > 0 && !force) {
    console.log(
      `Snapshot for ${CURRENT_SEASON} Teilrunde ${teilrunde} already exists (${count} players) — leaving it frozen.`,
    );
    return;
  }

  console.log(`Computing DTR as of ${asOfIso} for ${CURRENT_SEASON} Teilrunde ${teilrunde}...`);
  const rows = await computeRankingRows(supabase, asOfIso);

  if ((count ?? 0) > 0) {
    const { error } = await supabase
      .from("verbandsrangliste_snapshots")
      .delete()
      .eq("season", CURRENT_SEASON)
      .eq("teilrunde", teilrunde);
    if (error) throw new Error(error.message);
    console.log(`  Removed the previous snapshot (${count} players).`);
  }

  const BATCH = 500;
  for (let i = 0; i < rows.length; i += BATCH) {
    const { error } = await supabase.from("verbandsrangliste_snapshots").insert(
      rows.slice(i, i + BATCH).map((r) => ({
        season: CURRENT_SEASON,
        teilrunde,
        player_id: r.id,
        dtr: r.dtr,
        club: r.club,
      })),
    );
    if (error) throw new Error(error.message);
  }
  console.log(`Done. ${rows.length} players snapshotted.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
