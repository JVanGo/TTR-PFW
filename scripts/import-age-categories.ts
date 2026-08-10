/**
 * Populate players.age_category from the FLTT member registry export, against
 * the local Supabase. See lib/import/age-categories.ts for the matching logic
 * (by normalized player name — the export has no FLTT ID).
 *
 * Usage (PowerShell):
 *   npm run import:age-categories
 */

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import process from "node:process";

import { parseAgeCategoriesFile, applyAgeCategoriesToSupabase } from "../lib/import/age-categories";

config({ path: ".env.local" });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SOURCE_FILE = "Export-Members - 25-26_Espoirs.xlsx";

if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}
if (!/127\.0\.0\.1|localhost/.test(SUPABASE_URL)) {
  console.error(`Refusing to run against non-local Supabase: ${SUPABASE_URL}`);
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  console.log(`Target: ${SUPABASE_URL}`);
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
