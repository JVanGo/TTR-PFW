/**
 * Populate players.is_kader from lib/import/kader-data.ts (transcribed from
 * kaderzusammensetzung-november-2025.pdf), against the local Supabase.
 *
 * Usage (PowerShell):
 *   npx tsx scripts/import-kader.ts
 */

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import process from "node:process";

import { applyKaderToSupabase } from "../lib/import/kader";

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

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  console.log(`Target: ${SUPABASE_URL}`);
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
