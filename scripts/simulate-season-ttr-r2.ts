/**
 * Same as simulate-season-ttr.ts, but sources match history from the R2
 * player-history backup instead of MongoDB (see lib/import/r2-player-history.ts).
 * For comparing R2-sourced output against the known-good Mongo-sourced run —
 * see the plan's verification steps. No -prod sibling yet: this only ever
 * runs against the local Supabase.
 *
 * Usage (PowerShell):
 *   npm run simulate:season-ttr-r2
 */

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import process from "node:process";

import { runSeasonSimulation } from "../lib/import/ttr-simulation-io";

config({ path: ".env.local" });
process.env.DATA_SOURCE = "r2";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}
if (!/127\.0\.0\.1|localhost/.test(SUPABASE_URL)) {
  console.error(`Refusing to run against non-local Supabase: ${SUPABASE_URL}`);
  process.exit(1);
}
if (!process.env.MONGODB_URI || !process.env.MONGODB_DB_NAME) {
  console.error(
    "Missing MONGODB_URI or MONGODB_DB_NAME in .env.local (still used for the catalog).",
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
    "Missing R2_ENDPOINT, R2_BUCKET, R2_ACCESS_KEY_ID or R2_SECRET_ACCESS_KEY in .env.local",
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  console.log(`Target: ${SUPABASE_URL}`);
  const result = await runSeasonSimulation(supabase, (msg) => console.log(msg));
  console.log("Done.");
  console.log(`  ${result.matchRowCount} match rows written.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
