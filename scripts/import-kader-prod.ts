/**
 * Populate players.is_kader from lib/import/kader-data.ts, against
 * PRODUCTION Supabase. Safe to re-run (resets is_kader to false for
 * everyone, then sets it true for this run's matches).
 *
 * Reads credentials from .env.prod-seed (gitignored, manually populated).
 * Refuses to run unless the URL contains "supabase.co" (cloud) AND the user
 * confirms by setting CONFIRM=YES in the environment.
 *
 * Usage (PowerShell):
 *   $env:CONFIRM = "YES"
 *   npx tsx scripts/import-kader-prod.ts
 */

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import process from "node:process";

import { applyKaderToSupabase } from "../lib/import/kader";

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

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  console.log(`Target (PROD): ${SUPABASE_URL}`);
  const result = await applyKaderToSupabase(supabase, (msg) => console.log(msg));
  console.log("Done.");
  console.log(
    `  matched=${result.matchedIds.length} unmatched=${result.unmatched.length} ambiguous=${result.ambiguous.length}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
