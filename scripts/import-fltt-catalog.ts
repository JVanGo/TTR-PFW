/**
 * Refresh the player catalog (name/class/PFW/club) from the FLTT Progress
 * Tracker Mongo database — a richer, more current source than the manual
 * Verbandsrangliste export. See applyFlttCatalogToSupabase() for the upsert
 * semantics (matched players updated, new players inserted, missing players
 * deactivated — never deleted, so matches and classement_points survive).
 *
 * Runs against the local Supabase via the service-role key, so it bypasses
 * RLS. Never run this against production — see import-fltt-catalog-prod.ts.
 *
 * Usage (PowerShell):
 *   npm run import:fltt-catalog
 */

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import process from "node:process";

import { applyFlttCatalogToSupabase } from "../lib/import/fltt-progress-tracker";

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
