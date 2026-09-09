/**
 * Simulate season 2025-2026 TTR from match results (see DëschTennisRating.pdf)
 * against PRODUCTION Supabase. Wipes and replaces the season's `matches` rows
 * — safe to re-run, always recomputes the whole season from scratch.
 *
 * Sources the player catalog and match history from the Cloudflare R2
 * player-history backup (see lib/import/r2-player-history.ts) — the Mongo
 * database this used to read from was permanently decommissioned 2026-09-09
 * (see [[reference-cosmos-db-timeouts]]). The very first run on a given
 * machine lists and fetches the whole R2 bucket (~5.5GB) to build the
 * catalog; it reuses the same TTR/r2-cache/ disk cache as
 * simulate-season-ttr-r2.ts, so if that's already been run locally this
 * reuses its cache instead of re-downloading.
 *
 * Reads credentials from .env.prod-seed (gitignored, manually populated).
 * Refuses to run unless the URL contains "supabase.co" (cloud) AND the user
 * confirms by setting CONFIRM=YES in the environment.
 *
 * .env.prod-seed must contain:
 *   NEXT_PUBLIC_SUPABASE_URL=...
 *   SUPABASE_SERVICE_ROLE_KEY=...
 *   R2_ENDPOINT=...
 *   R2_BUCKET=...
 *   R2_ACCESS_KEY_ID=...
 *   R2_SECRET_ACCESS_KEY=...
 *
 * Usage (PowerShell):
 *   $env:CONFIRM = "YES"
 *   npx tsx scripts/simulate-season-ttr-prod.ts
 */

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import process from "node:process";

import { runSeasonSimulation } from "../lib/import/ttr-simulation-io";

config({ path: ".env.prod-seed" });
process.env.DATA_SOURCE = "r2";

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
if (
  !process.env.R2_ENDPOINT ||
  !process.env.R2_BUCKET ||
  !process.env.R2_ACCESS_KEY_ID ||
  !process.env.R2_SECRET_ACCESS_KEY
) {
  console.error(
    "Missing R2_ENDPOINT, R2_BUCKET, R2_ACCESS_KEY_ID or R2_SECRET_ACCESS_KEY in .env.prod-seed",
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

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  console.log(`Target (PROD): ${SUPABASE_URL}`);
  const result = await runSeasonSimulation(supabase, (msg) => console.log(msg));
  console.log("Done.");
  console.log(`  ${result.matchRowCount} match rows written.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
