/**
 * Refresh the player catalog (name/class/PFW/club) from the FLTT Progress
 * Tracker Mongo database — a richer, more current source than the manual
 * Verbandsrangliste export. Reuses the same diffRangliste() upsert as the
 * live /admin/import Verbandsrangliste flow: matched players are updated,
 * new players inserted, missing players deactivated (never deleted), so
 * existing matches and classement_points are untouched.
 *
 * Runs against the local Supabase via the service-role key, so it bypasses
 * RLS. Never run this against production.
 *
 * Usage (PowerShell):
 *   npm run import:fltt-catalog
 */

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import process from "node:process";

import { fetchCatalogFromMongo } from "../lib/import/fltt-progress-tracker";
import { diffRangliste, type RanglistEntry } from "../lib/import/verbandsrangliste";

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

interface ExistingPlayer {
  id: string;
  name_key: string;
  is_active: boolean;
}

async function fetchExistingPlayers(): Promise<ExistingPlayer[]> {
  const existing: ExistingPlayer[] = [];
  let from = 0;
  const pageSize = 1000;
  for (;;) {
    const { data, error } = await supabase
      .from("players")
      .select("id, name_key, is_active")
      .range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    existing.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return existing;
}

async function main() {
  console.log(`Fetching player catalog from MongoDB (${process.env.MONGODB_DB_NAME})...`);
  const { entries, skipped } = await fetchCatalogFromMongo();
  console.log(`  ${entries.length} players read, ${skipped} skipped (non A1-D3 ranking).`);

  console.log(`Loading existing players from ${SUPABASE_URL}...`);
  const existing = await fetchExistingPlayers();
  console.log(`  ${existing.length} existing players.`);

  const diff = diffRangliste(entries, existing);

  if (diff.toInsert.length > 0) {
    console.log(`Inserting ${diff.toInsert.length} new players...`);
    for (let i = 0; i < diff.toInsert.length; i += 500) {
      const chunk = diff.toInsert.slice(i, i + 500).map((e: RanglistEntry) => ({
        name: e.name,
        class: e.class,
        pfw: e.pfw,
        club: e.club,
        is_active: true,
      }));
      const { error } = await supabase.from("players").insert(chunk);
      if (error) throw new Error(error.message);
      process.stdout.write(
        `  ${Math.min(i + 500, diff.toInsert.length)}/${diff.toInsert.length}\r`,
      );
    }
    console.log();
  }

  if (diff.toUpdate.length > 0) {
    console.log(`Updating ${diff.toUpdate.length} existing players...`);
    for (let i = 0; i < diff.toUpdate.length; i += 200) {
      const chunk = diff.toUpdate.slice(i, i + 200);
      await Promise.all(
        chunk.map(({ id, entry }) =>
          supabase
            .from("players")
            .update({
              name: entry.name,
              class: entry.class,
              pfw: entry.pfw,
              club: entry.club,
              is_active: true,
            })
            .eq("id", id),
        ),
      );
      process.stdout.write(
        `  ${Math.min(i + 200, diff.toUpdate.length)}/${diff.toUpdate.length}\r`,
      );
    }
    console.log();
  }

  if (diff.toDeactivate.length > 0) {
    console.log(`Deactivating ${diff.toDeactivate.length} players no longer in the catalog...`);
    await supabase.from("players").update({ is_active: false }).in("id", diff.toDeactivate);
  }

  console.log("Done.");
  console.log(
    `  added=${diff.toInsert.length} updated=${diff.toUpdate.length} deactivated=${diff.toDeactivate.length} skipped=${skipped}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
