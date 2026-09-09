import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { GetObjectCommand, ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";
import { estimateTtr, isPlayerClass, type PlayerClass } from "@/lib/conversions";
import { parseFlttMatchSnapshot } from "./fltt-match-snapshot";

// Player-history backup, one JSON file per player, exported from the same
// upstream crawler that feeds MongoDB — see TTR/R2-integration-guide.md and
// Dataset/DATASET_HANDOFF.md section 7 for the shape this mirrors.

export interface RencontresRawRow {
  id: string;
  season: string;
  rowType: "match" | "tournamentPlacement" | "separator" | "summary";
  date: string;
  isoDate: string;
  competition: string;
  round: string;
  matchLabel: string;
  playerRanking: string;
  points: string;
  score: string;
  opponentRanking: string;
  opponent: string;
  rowNumber: number;
  playerScore: number | null;
  opponentScore: number | null;
  won: boolean | null;
  tournamentPlacement: { label: string; place: number } | null;
  rawCells: string[];
}

export interface PerformanceRawRow {
  id: string;
  season: string;
  date: string;
  isoDate: string;
  competition: string;
  opponentName: string;
  opponentClub: string;
  opponentPerformanceBefore: number | null;
  winFactor: number | null;
  score: string;
  playerScore: number | null;
  opponentScore: number | null;
  opponentWeight: string;
  performanceAfter: number | null;
  rowNumber: number;
  won: boolean | null;
  rawCells: string[];
}

export interface PlayerMatch {
  id: string;
  playerId: string;
  playerName: string;
  season: string;
  date: string;
  isoDate: string;
  competition: string;
  opponentName: string;
  score: string | null;
  playerScore: number | null;
  opponentScore: number | null;
  won: boolean | null;
  joinKey: string;
  hasPerformance: boolean;
  rencontres: {
    date: string;
    competition: string;
    round: string;
    matchLabel: string;
    playerRanking: string;
    points: string;
    score: string;
    opponentRanking: string;
    opponentName: string;
    rowNumber: number;
    rawCells: string[];
  };
  performance: {
    date: string;
    competition: string;
    opponentName: string;
    opponentClub: string;
    score: string;
    opponentWeight: string;
    opponentPerformanceBefore: number | null;
    winFactor: number | null;
    performanceAfter: number | null;
    rowNumber: number;
    rawCells: string[];
  } | null;
}

export interface PlayerHistorySeason {
  season: string;
  rencontresRows: RencontresRawRow[];
  performanceRows: PerformanceRawRow[];
  matches: RencontresRawRow[];
  tournamentPlacements: RencontresRawRow[];
  unifiedMatches: PlayerMatch[];
}

export interface PlayerHistory {
  player: { flttPlayerId: string; name: string; flttUrl: string };
  sourceUrl: string;
  currentSeason: string;
  excludedSeasons: string[];
  seasons: PlayerHistorySeason[];
  matches: RencontresRawRow[];
  tournamentPlacements: RencontresRawRow[];
  unifiedMatches: PlayerMatch[];
  unmatchedPerformanceRows: PerformanceRawRow[];
  crawledAt: string;
  refreshCycle?: string;
}

// Local cache of fetched player files — already covered by the /TTR/
// gitignore rule. Avoids re-spending R2's request quota on repeated local
// runs (see "Cache data, avoid repeatedly scanning" in the integration
// guide).
const CACHE_DIR = join(process.cwd(), "TTR", "r2-cache");

let cachedClient: S3Client | null = null;

function r2Client(): S3Client {
  if (cachedClient) return cachedClient;
  const endpoint = process.env.R2_ENDPOINT;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  if (!endpoint || !accessKeyId || !secretAccessKey) {
    throw new Error("Missing R2_ENDPOINT, R2_ACCESS_KEY_ID or R2_SECRET_ACCESS_KEY.");
  }
  cachedClient = new S3Client({
    endpoint,
    region: "auto",
    credentials: { accessKeyId, secretAccessKey },
  });
  return cachedClient;
}

function r2Bucket(): string {
  const bucket = process.env.R2_BUCKET;
  if (!bucket) throw new Error("Missing R2_BUCKET.");
  return bucket;
}

async function streamToString(body: unknown): Promise<string> {
  const chunks: Buffer[] = [];
  // The Node runtime's GetObjectCommandOutput.Body is an async-iterable
  // Readable stream of Buffer chunks.
  for await (const chunk of body as AsyncIterable<Buffer>) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf-8");
}

/** Fetches one player's match-history file, using a local disk cache so a
 * repeated run of the season simulation doesn't re-download every player. */
export async function fetchPlayerHistoryFromR2(flttPlayerId: string): Promise<PlayerHistory> {
  if (!/^\d+$/.test(flttPlayerId)) {
    throw new Error(`Use a numeric FLTT player ID, got: ${flttPlayerId}`);
  }
  const cachePath = join(CACHE_DIR, `${flttPlayerId}.json`);
  if (existsSync(cachePath)) {
    return JSON.parse(readFileSync(cachePath, "utf-8")) as PlayerHistory;
  }

  const response = await r2Client().send(
    new GetObjectCommand({ Bucket: r2Bucket(), Key: `player-histories/${flttPlayerId}.json` }),
  );
  const text = await streamToString(response.Body);
  mkdirSync(CACHE_DIR, { recursive: true });
  writeFileSync(cachePath, text, "utf-8");
  return JSON.parse(text) as PlayerHistory;
}

/** Full-bucket listing — not called anywhere by default. Only relevant if a
 * bulk sync is deliberately requested later (see the plan's "explicitly out
 * of scope" note on the full 4,962-file / 5.5GB bucket). */
export async function listAllPlayerHistoryKeys(): Promise<string[]> {
  const client = r2Client();
  const bucket = r2Bucket();
  const keys: string[] = [];
  let continuationToken: string | undefined;
  do {
    const page = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: "player-histories/",
        ContinuationToken: continuationToken,
      }),
    );
    for (const obj of page.Contents ?? []) {
      if (obj.Key?.endsWith(".json")) keys.push(obj.Key);
    }
    continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (continuationToken);
  return keys;
}

/** Runs `fn` over `items` with at most `concurrency` in flight at once —
 * gentle on R2's request rate compared to firing everything in parallel. */
export async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;
  async function worker() {
    for (;;) {
      const i = nextIndex++;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}

// Mirrors ttr-simulation-io.ts's LAST_ACTIVE_DATE_SEASON_LOOKBACK /
// previousNSeasons / seasonStartYear — duplicated (not imported) to avoid a
// circular import between the two modules; keep both in sync if either
// changes.
const LAST_ACTIVE_DATE_SEASON_LOOKBACK = 4;

function seasonStartYear(season: string): number {
  return Number(season.split("-")[0]);
}

function previousNSeasons(current: string, n: number): string[] {
  const start = seasonStartYear(current);
  const pad = (v: number) => String(((v % 100) + 100) % 100).padStart(2, "0");
  return Array.from({ length: n }, (_, i) => `${pad(start - i - 1)}-${pad(start - i)}`);
}

export interface MappedSeasonMatch {
  id: string;
  flttPlayerId: string;
  playerName: string;
  opponentName: string;
  isoDate: string;
  competition: string;
  score: string | null;
  won: boolean | null;
  hasPerformance: boolean;
  rencontres?: { competition?: string; round?: string; matchLabel?: string; points?: string };
  performance?: { opponentClub?: string | null } | null;
}

export interface MappedTournamentPlacement {
  flttPlayerId: string;
  isoDate: string;
  competition: string;
  tournamentPlacement: { place: number } | null;
}

export interface MappedSeasonStartSnapshot {
  ttr: number;
  isoDate: string;
}

export interface MappedR2SeasonData {
  seasonMatches: MappedSeasonMatch[];
  placements: MappedTournamentPlacement[];
  priorSeasonStats: { count: number; lastIsoDate: string | null };
  seasonStartSnapshot: MappedSeasonStartSnapshot | null;
}

export interface R2CatalogPlayerDoc {
  flttPlayerId: string;
  name: string;
  /** Not derivable from R2 — a player's own current club isn't recorded on
   * their own match rows (only an opponent's club sometimes is). Always
   * null; degrades self/opponent-name disambiguation for the rare case of
   * two tracked players sharing a name, same as a Mongo catalog row with an
   * unknown club would. */
  club: null;
  /** Most recent parseable class/PFW snapshot found across the player's
   * entire history (any season), newest first — approximates what the Mongo
   * `players` collection's ranking crawl would show "today". Blank/0 when no
   * row ever carried a parseable snapshot (see parseFlttMatchSnapshot) —
   * matches MongoCatalogPlayerDoc's shape so downstream code (which already
   * treats an unrecognized ranking as "not a player class, skip") needs no
   * changes. */
  ranking: string;
  performanceScore: number;
}

/**
 * Builds a catalog-equivalent list entirely from R2, so the R2 data path
 * never needs Mongo to be reachable — see fetchCatalogOnlyFromMongo's
 * removal in ttr-simulation-io.ts. There's no catalog/search endpoint on the
 * bucket, so the only way to discover every player is to list and fetch the
 * whole thing once; the local disk cache (see fetchPlayerHistoryFromR2)
 * means only the very first run actually pays that cost. This mirrors the
 * integration guide's own documented "sync the whole dataset" workflow, not
 * an unsupported use of the bucket.
 */
export async function fetchCatalogFromR2(
  onProgress?: (done: number, total: number) => void,
): Promise<R2CatalogPlayerDoc[]> {
  const keys = await listAllPlayerHistoryKeys();
  const playerIds = keys
    .map((k) => k.match(/([0-9]+)\.json$/)?.[1])
    .filter((id): id is string => id != null);

  let done = 0;
  const catalog = await mapWithConcurrency(playerIds, 8, async (flttPlayerId) => {
    const history = await fetchPlayerHistoryFromR2(flttPlayerId);
    done++;
    if (onProgress) onProgress(done, playerIds.length);

    const allSnapshotRows = history.seasons
      .flatMap((s) => s.rencontresRows)
      .filter((r) => r.rowType === "match" && r.points?.startsWith("{"))
      .slice()
      .sort((a, b) => (a.isoDate < b.isoDate ? 1 : a.isoDate > b.isoDate ? -1 : 0)); // newest first

    let ranking = "";
    let performanceScore = 0;
    for (const row of allSnapshotRows) {
      const parsed = parseFlttMatchSnapshot(row.points, flttPlayerId);
      if (!parsed || parsed.performance == null) continue;
      ranking = parsed.ranking.trim().toUpperCase();
      performanceScore = parsed.performance;
      break;
    }

    const doc: R2CatalogPlayerDoc = {
      flttPlayerId,
      name: history.player.name,
      club: null,
      ranking,
      performanceScore,
    };
    return doc;
  });

  return catalog;
}

/**
 * Maps one player's full R2 history into the same shape
 * fetchMongoData()/fetchPriorSeasonStats()/fetchSeasonStartTtr() produce from
 * their Mongo collections — see ttr-simulation-io.ts and
 * season-start-snapshot.ts. Since the R2 file already holds the player's
 * entire career across seasons, this needs no cross-season queries at all
 * (that batching was purely a Cosmos DB workaround).
 */
export function mapPlayerHistoryToSeasonData(
  history: PlayerHistory,
  season: string,
): MappedR2SeasonData {
  const flttPlayerId = history.player.flttPlayerId;

  const seasonMatches: MappedSeasonMatch[] = history.unifiedMatches
    .filter((m) => m.season === season)
    .map((m) => ({
      id: m.id,
      flttPlayerId,
      playerName: m.playerName,
      opponentName: m.opponentName,
      isoDate: m.isoDate,
      competition: m.competition,
      score: m.score,
      won: m.won,
      hasPerformance: m.hasPerformance,
      rencontres: m.rencontres
        ? {
            competition: m.rencontres.competition,
            round: m.rencontres.round,
            matchLabel: m.rencontres.matchLabel,
            points: m.rencontres.points,
          }
        : undefined,
      performance: m.performance ? { opponentClub: m.performance.opponentClub ?? null } : null,
    }));

  const placements: MappedTournamentPlacement[] = history.tournamentPlacements
    .filter((p) => p.season === season && p.rowType === "tournamentPlacement")
    .map((p) => ({
      flttPlayerId,
      isoDate: p.isoDate,
      competition: p.competition,
      tournamentPlacement: p.tournamentPlacement ? { place: p.tournamentPlacement.place } : null,
    }));

  const currentStartYear = seasonStartYear(season);
  let priorMatchCount = 0;
  for (const s of history.seasons) {
    if (seasonStartYear(s.season) >= currentStartYear) continue;
    priorMatchCount += s.matches.length;
  }

  const lookbackSeasons = new Set(previousNSeasons(season, LAST_ACTIVE_DATE_SEASON_LOOKBACK));
  let lastIsoDate: string | null = null;
  for (const s of history.seasons) {
    if (!lookbackSeasons.has(s.season)) continue;
    for (const m of s.unifiedMatches) {
      if (!lastIsoDate || m.isoDate > lastIsoDate) lastIsoDate = m.isoDate;
    }
  }

  const seasonEntry = history.seasons.find((s) => s.season === season);
  const snapshotCandidates = (seasonEntry?.rencontresRows ?? [])
    .filter((r) => r.rowType === "match" && r.points?.startsWith("{"))
    .slice()
    .sort((a, b) => (a.isoDate < b.isoDate ? -1 : a.isoDate > b.isoDate ? 1 : 0));
  let seasonStartSnapshot: MappedSeasonStartSnapshot | null = null;
  for (const row of snapshotCandidates) {
    const parsed = parseFlttMatchSnapshot(row.points, flttPlayerId);
    if (!parsed) continue;
    const cls = parsed.ranking.trim().toUpperCase();
    if (!isPlayerClass(cls) || parsed.performance == null) continue;
    const ttr = estimateTtr(parsed.performance, cls as PlayerClass, parsed.points);
    if (ttr != null) {
      seasonStartSnapshot = { ttr, isoDate: row.isoDate };
      break;
    }
  }

  return {
    seasonMatches,
    placements,
    priorSeasonStats: { count: priorMatchCount, lastIsoDate },
    seasonStartSnapshot,
  };
}
