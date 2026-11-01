import "@/lib/import/dommatrix-polyfill";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { extractText, getDocumentProxy } from "unpdf";
import {
  TOURNAMENT_ENTRIES_PATH,
  parseTournamentPdfText,
  type TournamentEntries,
  type TournamentEntriesFile,
} from "@/lib/import/tournament-entries";

// Downloads FLTT's per-tournament result PDFs and writes the entry counts the
// small-category placement rule needs to lib/import/tournament-entries.json.
// Read-only towards fltt.lu; touches no database. Safe to re-run anytime.
//
//   npx tsx scripts/sync-tournament-entries.ts [--since 2025-08-01]
//
// PDFs are cached in TTR/tournament-pdfs/ (gitignored), so re-runs only fetch
// new ones.

const LIST_URL =
  "https://www.fltt.lu/sport-national/competitions-individuelles/tournois-individuels";
const BASE = "https://www.fltt.lu";
const CACHE_DIR = join(process.cwd(), "TTR", "tournament-pdfs");
const DEFAULT_SINCE = "2025-08-01";

function argValue(flag: string): string | null {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? (process.argv[i + 1] ?? null) : null;
}

async function fetchWithTimeout(url: string): Promise<Response> {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (TTR-PFW tournament sync)" },
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res;
}

async function main() {
  const since = argValue("--since") ?? DEFAULT_SINCE;
  mkdirSync(CACHE_DIR, { recursive: true });

  const html = await (await fetchWithTimeout(LIST_URL)).text();
  const links = [...new Set([...html.matchAll(/href="(\/media\/[^"]+\.pdf)"/g)].map((m) => m[1]))]
    .map((href) => ({ href, file: href.split("/").pop()! }))
    .filter((l) => /^\d{4}-\d{2}-\d{2}-/.test(l.file) && l.file.slice(0, 10) >= since)
    .sort((a, b) => a.file.localeCompare(b.file));
  console.log(`${links.length} tournament PDFs dated ${since} or later.`);

  const tournaments: TournamentEntries[] = [];
  let downloaded = 0;
  for (const { href, file } of links) {
    const cachePath = join(CACHE_DIR, file);
    if (!existsSync(cachePath)) {
      const buf = Buffer.from(await (await fetchWithTimeout(BASE + href)).arrayBuffer());
      writeFileSync(cachePath, buf);
      downloaded++;
    }
    const pdf = await getDocumentProxy(new Uint8Array(readFileSync(cachePath)));
    const { text } = await extractText(pdf, { mergePages: true });
    const parsed = parseTournamentPdfText(text);
    const catCount = Object.keys(parsed.categories).length;
    if (catCount === 0) console.warn(`  ${file}: no categories recognised, skipped.`);
    else tournaments.push({ isoDate: file.slice(0, 10), source: file, ...parsed });
  }

  const out: TournamentEntriesFile = { syncedAt: new Date().toISOString(), tournaments };
  writeFileSync(TOURNAMENT_ENTRIES_PATH, `${JSON.stringify(out, null, 1)}\n`);
  console.log(
    `Wrote ${tournaments.length} tournaments (${downloaded} newly downloaded) to ${TOURNAMENT_ENTRIES_PATH}.`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
