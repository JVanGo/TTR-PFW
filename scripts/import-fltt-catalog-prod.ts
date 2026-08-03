/**
 * Refresh the player catalog (name/class/PFW/club) against PRODUCTION Supabase
 * from the FLTT Progress Tracker Mongo database.
 *
 * Safe to re-run: uses the same upsert as the local script and the live
 * /admin/import Verbandsrangliste flow (see applyFlttCatalogToSupabase) —
 * matched players are updated, new players inserted, missing players
 * deactivated (never deleted), so existing matches and classement_points are
 * untouched.
 *
 * Reads credentials from .env.prod-seed (gitignored, manually populated).
 * Refuses to run unless the URL contains "supabase.co" (cloud) AND the user
 * confirms by setting CONFIRM=YES in the environment.
 *
 * .env.prod-seed must contain:
 *   NEXT_PUBLIC_SUPABASE_URL=...
 *   SUPABASE_SERVICE_ROLE_KEY=...
 *   MONGODB_URI=...
 *   MONGODB_DB_NAME=...
 *
 * Usage (PowerShell):
 *   $env:CONFIRM = "YES"
 *   npx tsx scripts/import-fltt-catalog-prod.ts
 */

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import process from "node:process";

import { applyFlttCatalogToSupabase } from "../lib/import/fltt-progress-tracker";

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
if (!process.env.MONGODB_URI || !process.env.MONGODB_DB_NAME) {
  console.error("Missing MONGODB_URI or MONGODB_DB_NAME in .env.prod-seed");
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
  const summary = await applyFlttCatalogToSupabase(supabase, (msg) => console.log(msg));
  console.log("Done.");
  console.log(
    `  added=${summary.added} updated=${summary.updated} deactivated=${summary.deactivated} skipped=${summary.skipped}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
