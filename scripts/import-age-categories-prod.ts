/**
 * Populate players.age_category from the FLTT member registry export, against
 * PRODUCTION Supabase. Safe to re-run — the export is treated as the
 * complete, authoritative youth roster, so anyone previously tagged with a
 * category but missing from this run's export (aged out of every category)
 * is reset back to adult, not just left stale.
 *
 * Reads Supabase credentials from .env.prod-seed (gitignored, manually
 * populated). Refuses to run unless the URL contains "supabase.co" (cloud)
 * AND the user confirms by setting CONFIRM=YES in the environment.
 *
 * .env.prod-seed must contain:
 *   NEXT_PUBLIC_SUPABASE_URL=...
 *   SUPABASE_SERVICE_ROLE_KEY=...
 *
 * Usage (PowerShell):
 *   $env:CONFIRM = "YES"
 *   npx tsx scripts/import-age-categories-prod.ts
 */

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import process from "node:process";

import { parseAgeCategoriesFile, applyAgeCategoriesToSupabase } from "../lib/import/age-categories";

config({ path: ".env.prod-seed" });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const CONFIRM = process.env.CONFIRM;
// Update this filename each season. Note: at the 26/27 rollover, three
// players newly surfaced this way (ZENNANE Laith, GREIVELDINGER Niels,
// OLINGER Laurent) tripped audit-season-prod.ts's "new player isn't the
// beginner default" check — all three checked out fine against fltt.lu/the
// R2 backup. They were real veterans first synced into Supabase via that
// same rollover's R2 catalog run, not actual beginners, so the flat D2/D3
// default heuristic doesn't apply to them. Expect more of this kind of
// false positive whenever a season's pipeline run surfaces previously-
// untracked players with real history.
const SOURCE_FILE = "Export-Members - 26-27_Espoirs.xlsx";

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

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  console.log(`Target (PROD): ${SUPABASE_URL}`);
  console.log(`Reading ${SOURCE_FILE}...`);
  const entries = parseAgeCategoriesFile(SOURCE_FILE);
  console.log(`  ${entries.length} rows with a recognized age category.`);

  const summary = await applyAgeCategoriesToSupabase(supabase, entries, (msg) => console.log(msg));
  console.log("Done.");
  console.log(
    `  matched=${summary.matched} unmatched=${summary.unmatched} ambiguous=${summary.ambiguous.length} ` +
      `cleared=${summary.cleared.length}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
