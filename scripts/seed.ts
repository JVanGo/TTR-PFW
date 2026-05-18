/**
 * One-time data load for local development.
 *
 * 1. Insert all 2,227 players from the preserved Verbandsrangliste blob.
 * 2. Backfill the `club` column from the Saisonentwicklung Overview sheet.
 * 3. Insert every match from each per-player sheet of the Saisonentwicklung.
 * 4. Fill in matches.opponent_player_id where the opponent resolves to a known player.
 *
 * Runs against the local Supabase via the service-role key, so it bypasses RLS.
 * Never run this against production — that's what the admin import flows are for.
 *
 * Usage (PowerShell):
 *   npm run seed
 */

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import * as XLSX from "xlsx";
import path from "node:path";
import process from "node:process";

import { rankingData } from "./seed-data/ranking-2025-08-13";
import { nameKey } from "../lib/name-key";
import { isPlayerClass } from "../lib/conversions";

config({ path: ".env.local" });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}
if (!/127\.0\.0\.1|localhost/.test(SUPABASE_URL)) {
  console.error(`Refusing to seed against non-local Supabase: ${SUPABASE_URL}`);
  process.exit(1);
}

const SAISONENTWICKLUNG = path.join("TTR", "TTR-Saisonentwicklung.xlsx");
const SEASON = "2025-2026";

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function clearExistingData() {
  console.log("Wiping existing matches + players (local only)...");
  await supabase.from("matches").delete().not("id", "is", null);
  await supabase.from("players").delete().not("id", "is", null);
}

async function insertPlayers() {
  console.log(`Inserting ${rankingData.length} players...`);
  const rows = rankingData.map((p) => {
    if (!isPlayerClass(p.kl)) {
      throw new Error(`Unknown class for ${p.name}: ${p.kl}`);
    }
    return {
      name: p.name,
      class: p.kl,
      pfw: p.pfw,
      is_active: true,
    };
  });

  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    const { error } = await supabase.from("players").insert(chunk);
    if (error) throw error;
    process.stdout.write(`  ${Math.min(i + 500, rows.length)}/${rows.length}\r`);
  }
  console.log();
}

interface PlayerLookup {
  id: string;
  name: string;
}

async function fetchPlayerIdMap(): Promise<Map<string, PlayerLookup>> {
  const map = new Map<string, PlayerLookup>();
  let from = 0;
  const pageSize = 1000;
  for (;;) {
    const { data, error } = await supabase
      .from("players")
      .select("id, name, name_key")
      .range(from, from + pageSize - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    for (const row of data) {
      map.set(row.name_key, { id: row.id, name: row.name });
    }
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return map;
}

interface OverviewRow {
  club: string | null;
  name: string;
}

function readOverview(wb: XLSX.WorkBook): OverviewRow[] {
  const sheet = wb.Sheets["Overview"];
  if (!sheet) throw new Error("Overview sheet missing");
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as unknown[][];
  const result: OverviewRow[] = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!Array.isArray(row)) continue;
    const club = typeof row[0] === "string" ? row[0] : null;
    const name = typeof row[1] === "string" ? row[1] : null;
    if (!name) continue;
    result.push({ club, name });
  }
  return result;
}

async function backfillClubs(wb: XLSX.WorkBook, byKey: Map<string, PlayerLookup>) {
  console.log("Backfilling clubs from Overview sheet...");
  const overview = readOverview(wb);
  let matched = 0;
  const updates: Array<{ id: string; club: string }> = [];
  for (const row of overview) {
    const player = byKey.get(nameKey(row.name));
    if (!player || !row.club) continue;
    updates.push({ id: player.id, club: row.club });
    matched++;
  }
  for (let i = 0; i < updates.length; i += 200) {
    const chunk = updates.slice(i, i + 200);
    await Promise.all(
      chunk.map(({ id, club }) => supabase.from("players").update({ club }).eq("id", id)),
    );
    process.stdout.write(`  ${Math.min(i + 200, updates.length)}/${updates.length}\r`);
  }
  console.log();
  console.log(`  ${matched} of ${overview.length} overview rows linked to ranked players`);
}

interface RawMatchRow {
  date: string;
  competition: string;
  opponent: string;
  opponentTtr: number | null;
  score: string;
  result: "W" | "L";
  delta: number;
  newTtr: number;
}

function parseMatchSheet(rows: unknown[][]): RawMatchRow[] {
  const out: RawMatchRow[] = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!Array.isArray(row) || row.length < 8) continue;
    const [date, competition, opponent, oppTtrRaw, score, wl, deltaRaw, newTtrRaw] = row;
    if (
      typeof date !== "string" ||
      typeof competition !== "string" ||
      typeof opponent !== "string"
    ) {
      continue;
    }
    if (wl !== "W" && wl !== "L") continue;
    out.push({
      date,
      competition,
      opponent,
      opponentTtr: typeof oppTtrRaw === "number" ? oppTtrRaw : null,
      score: typeof score === "string" ? score : String(score ?? ""),
      result: wl,
      delta: typeof deltaRaw === "number" ? deltaRaw : Number(deltaRaw) || 0,
      newTtr: typeof newTtrRaw === "number" ? newTtrRaw : Number(newTtrRaw) || 0,
    });
  }
  return out;
}

async function insertMatches(wb: XLSX.WorkBook, byKey: Map<string, PlayerLookup>) {
  console.log("Inserting matches from per-player sheets...");
  const sheetsToSkip = new Set(["Overview", "Overview (TOU)"]);
  const sheetNames = wb.SheetNames.filter((n) => !sheetsToSkip.has(n));
  let totalInserted = 0;
  let unmatchedPlayers = 0;
  const batch: Array<Record<string, unknown>> = [];

  async function flush() {
    if (batch.length === 0) return;
    const { error } = await supabase.from("matches").insert(batch);
    if (error) throw error;
    totalInserted += batch.length;
    batch.length = 0;
  }

  for (let s = 0; s < sheetNames.length; s++) {
    const sheetName = sheetNames[s];
    const player = byKey.get(nameKey(sheetName));
    if (!player) {
      unmatchedPlayers++;
      continue;
    }
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1 }) as unknown[][];
    const parsed = parseMatchSheet(rows);
    for (const m of parsed) {
      const opponent = byKey.get(nameKey(m.opponent));
      batch.push({
        player_id: player.id,
        match_date: m.date,
        competition: m.competition,
        opponent_name: m.opponent,
        opponent_player_id: opponent?.id ?? null,
        opponent_ttr: m.opponentTtr,
        score: m.score,
        result: m.result,
        ttr_delta: Math.round(m.delta),
        new_ttr: Math.round(m.newTtr),
        season: SEASON,
      });
      if (batch.length >= 1000) {
        await flush();
        process.stdout.write(
          `  sheet ${s + 1}/${sheetNames.length}, ${totalInserted} matches inserted\r`,
        );
      }
    }
  }
  await flush();
  console.log();
  console.log(`  ${totalInserted} matches inserted`);
  console.log(`  ${unmatchedPlayers} per-player sheets skipped (player not in the ranked list)`);
}

async function main() {
  console.log(`Seeding local Supabase at ${SUPABASE_URL}`);
  const wb = XLSX.readFile(SAISONENTWICKLUNG);

  await clearExistingData();
  await insertPlayers();
  const byKey = await fetchPlayerIdMap();
  console.log(`  ${byKey.size} player rows readable post-insert`);
  await backfillClubs(wb, byKey);
  await insertMatches(wb, byKey);
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
