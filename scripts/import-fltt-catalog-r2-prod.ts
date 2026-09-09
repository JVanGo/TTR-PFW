/**
 * Sync class/PFW/club for already-tracked players from the R2 player-history
 * backup, and insert genuinely new ones, against PRODUCTION Supabase. See
 * syncR2CatalogToSupabase()'s doc comment in lib/import/r2-catalog-sync.ts
 * for the exact rules (partial updates that never null out a real club,
 * conservative new-player insertion gated on 24-month match recency, no
 * deactivate — is_active is handled separately by the season simulation).
 *
 * Reuses the same TTR/r2-cache/ disk cache as every other R2 script — if
 * simulate-season-ttr-r2.ts or import-fltt-catalog-r2.ts has already run on
 * this machine, this reuses that cache instead of re-downloading the bucket.
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
 *   npx tsx scripts/import-fltt-catalog-r2-prod.ts
 */

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import process from "node:process";

import { syncR2CatalogToSupabase } from "../lib/import/r2-catalog-sync";

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
  const s = await syncR2CatalogToSupabase(supabase, (msg) => console.log(msg));
  console.log("Done.");
  console.log(
    `  existing=${s.existing} matchedInR2=${s.matchedInR2} classPfwUpdated=${s.classPfwUpdated} ` +
      `clubUpdated=${s.clubUpdated} skippedNoMatch=${s.skippedNoMatch} ` +
      `skippedAmbiguous=${s.skippedAmbiguous} skippedNoSnapshot=${s.skippedNoSnapshot} ` +
      `inserted=${s.inserted} skippedNotRecentEnough=${s.skippedNotRecentEnough}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
