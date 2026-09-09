/**
 * Sync class/PFW/club/classement_points for already-tracked players from the
 * R2 player-history backup, and insert genuinely new ones. See
 * syncR2CatalogToSupabase()'s doc comment in lib/import/r2-catalog-sync.ts
 * for the exact rules — no deactivate-missing (is_active is handled
 * separately by the season simulation), careful partial-update handling so
 * an unknown club never wipes a real one, and conservative new-player
 * insertion gated on 24-month match recency.
 *
 * The very first run lists and fetches the whole R2 bucket (~5.5GB) to build
 * the catalog; later runs reuse the TTR/r2-cache/ disk cache and are fast.
 *
 * Runs against the local Supabase via the service-role key, so it bypasses
 * RLS. Local only — see import-fltt-catalog-r2-prod.ts for production.
 *
 * Usage (PowerShell):
 *   npm run import:fltt-catalog-r2
 */

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import process from "node:process";

import { syncR2CatalogToSupabase } from "../lib/import/r2-catalog-sync";

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
  const s = await syncR2CatalogToSupabase(supabase, (msg) => console.log(msg));
  console.log("Done.");
  console.log(
    `  existing=${s.existing} matchedInR2=${s.matchedInR2} classPfwUpdated=${s.classPfwUpdated} ` +
      `clubUpdated=${s.clubUpdated} classementPointsUpdated=${s.classementPointsUpdated} ` +
      `skippedNoMatch=${s.skippedNoMatch} skippedAmbiguous=${s.skippedAmbiguous} ` +
      `skippedNoSnapshot=${s.skippedNoSnapshot} inserted=${s.inserted} ` +
      `skippedNotRecentEnough=${s.skippedNotRecentEnough}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
