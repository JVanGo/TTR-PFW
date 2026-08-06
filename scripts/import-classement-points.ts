/**
 * Backfill `players.classement_points` (C1-D3 only) from the FLTT Progress
 * Tracker Mongo database. See applyClassementPointsToSupabase() for where the
 * value actually comes from (it's embedded inside team-competition match
 * rows, not a clean field) and its safe-to-rerun update semantics — an
 * admin's manual entry is only overwritten if Mongo's own value has changed.
 *
 * Runs against the local Supabase via the service-role key, so it bypasses
 * RLS. Never run this against production — see import-classement-points-prod.ts.
 *
 * Usage (PowerShell):
 *   npm run import:classement-points
 */

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import process from "node:process";

import { applyClassementPointsToSupabase } from "../lib/import/classement-points";

config({ path: ".env.local" });

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
  console.error("Missing MONGODB_URI or MONGODB_DB_NAME in .env.local");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  console.log(`Target: ${SUPABASE_URL}`);
  const summary = await applyClassementPointsToSupabase(supabase, (msg) => console.log(msg));
  console.log("Done.");
  console.log(
    `  mongoPlayersWithPoints=${summary.mongoPlayersWithPoints} matched=${summary.matched} ` +
      `updated=${summary.updated} unchanged=${summary.unchanged} unresolved=${summary.unresolved}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
