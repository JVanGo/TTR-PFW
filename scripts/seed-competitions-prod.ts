/**
 * ONE-TIME bulk load of Jeff's real competition list against the production
 * Supabase project — see scripts/seed-prod.ts for the same safety pattern
 * this reuses (reads .env.prod-seed, refuses without a *.supabase.co URL and
 * CONFIRM=YES).
 *
 * Usage (PowerShell):
 *   $env:CONFIRM = "YES"
 *   npx tsx scripts/seed-competitions-prod.ts
 */

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

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
  console.error(`Refusing without explicit confirmation. Re-run with CONFIRM=YES set.`);
  console.error(`Target: ${SUPABASE_URL}`);
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

interface CompetitionSeed {
  name: string;
  max_age_category: string | null;
  fixed_team_count: number | null;
  team_size: number;
}

// All 3-man teams except Championnat Seniors (4-man, or 3-man for a club's
// Division 6 team — split into two rows since the competitions table has no
// concept of "division", only fixed_team_count/team_size/max_age_category).
const COMPETITIONS: CompetitionSeed[] = [
  {
    name: "Coupe de Luxembourg Seniors",
    max_age_category: null,
    fixed_team_count: 1,
    team_size: 3,
  },
  { name: "Coupe Frantz Think", max_age_category: null, fixed_team_count: 1, team_size: 3 },
  { name: "Coupe Julien Mersch", max_age_category: null, fixed_team_count: 1, team_size: 3 },
  { name: "Coupe Felix Felten", max_age_category: null, fixed_team_count: null, team_size: 3 },
  { name: "Coupe de Luxembourg Dames", max_age_category: null, fixed_team_count: 1, team_size: 3 },
  { name: "Coupe de Jeunes", max_age_category: "Junior", fixed_team_count: null, team_size: 3 },
  { name: "Teens Cup", max_age_category: "Cadet", fixed_team_count: null, team_size: 3 },
  { name: "Kids Cup", max_age_category: "Minime", fixed_team_count: null, team_size: 3 },
  { name: "Championnat Seniors", max_age_category: null, fixed_team_count: null, team_size: 4 },
  {
    name: "Championnat Seniors (Division 6)",
    max_age_category: null,
    fixed_team_count: null,
    team_size: 3,
  },
  { name: "Championnat Dames", max_age_category: null, fixed_team_count: null, team_size: 3 },
  { name: "Championnat Jeunes", max_age_category: "Junior", fixed_team_count: null, team_size: 3 },
  { name: "Championnat Minimes", max_age_category: "Minime", fixed_team_count: null, team_size: 3 },
  { name: "Championnat Cadets", max_age_category: "Cadet", fixed_team_count: null, team_size: 3 },
];

async function main() {
  console.log(`Seeding ${COMPETITIONS.length} competitions into PROD Supabase at ${SUPABASE_URL}`);
  const { error } = await supabase
    .from("competitions")
    .upsert(COMPETITIONS, { onConflict: "name" });
  if (error) throw error;
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
