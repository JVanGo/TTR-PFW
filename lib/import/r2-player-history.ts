import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { GetObjectCommand, ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";
import { estimateTtr, isPlayerClass, type PlayerClass } from "@/lib/conversions";
import { nameKey } from "@/lib/name-key";
import { resolveClubAlias } from "./club-aliases";
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

/** Longest a single R2 request (including reading its body) may take before
 * it's treated as failed. A normal player file arrives in well under a
 * second; 60s leaves plenty of room for a slow-but-alive connection. */
const R2_ATTEMPT_TIMEOUT_MS = 60_000;

/** Rejects (and aborts the request) if `fn` hasn't settled within `ms` — a
 * connection that goes silent instead of erroring never rejects on its own. */
async function withTimeout<T>(fn: (signal: AbortSignal) => Promise<T>, ms: number): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error(`R2 request timed out after ${ms / 1000}s`));
    }, ms);
  });
  try {
    return await Promise.race([fn(controller.signal), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/** Retries a single transient socket drop (e.g. ECONNRESET) talking to R2 —
 * confirmed in prod 2026-10-08, where one dropped connection ~5000 files into
 * an 8-minute, 5,116-file catalog fetch killed the whole weekly sync. Waits
 * 1s/2s between the 3 attempts; a non-transient failure (e.g. bad creds)
 * still surfaces immediately on the final attempt. Each attempt is also
 * capped at R2_ATTEMPT_TIMEOUT_MS — on 2026-10-23 a connection hung silently
 * and stalled the weekly sync for 20+ minutes with no error to retry on. */
async function withR2Retry<T>(fn: (signal: AbortSignal) => Promise<T>, attempts = 3): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await withTimeout(fn, R2_ATTEMPT_TIMEOUT_MS);
    } catch (err) {
      lastErr = err;
      if (attempt < attempts) {
        await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
      }
    }
  }
  throw lastErr;
}

/** Fetches one player's match-history file, using a local disk cache so a
 * repeated run of the season simulation doesn't re-download every player. */
export async function fetchPlayerHistoryFromR2(flttPlayerId: string): Promise<PlayerHistory> {
  if (!/^\d+$/.test(flttPlayerId)) {
    throw new Error(`Use a numeric FLTT player ID, got: ${flttPlayerId}`);
  }
  const cachePath = join(CACHE_DIR, `${flttPlayerId}.json`);
  if (existsSync(cachePath)) {
    return sanitizeHistoryNames(JSON.parse(readFileSync(cachePath, "utf-8")) as PlayerHistory);
  }

  const text = await withR2Retry(async (abortSignal) => {
    const response = await r2Client().send(
      new GetObjectCommand({ Bucket: r2Bucket(), Key: `player-histories/${flttPlayerId}.json` }),
      { abortSignal },
    );
    return streamToString(response.Body);
  });
  mkdirSync(CACHE_DIR, { recursive: true });
  writeFileSync(cachePath, text, "utf-8");
  return sanitizeHistoryNames(JSON.parse(text) as PlayerHistory);
}

/**
 * FLTT's own crawler sometimes mis-encodes the hyphen in double-barreled
 * surnames as U+00AC (¬) instead of a normal "-" — confirmed against
 * fltt.lu source pages, which show a normal hyphen. This is the exact same
 * bug the old Mongo catalog importer (sanitizeFlttName, since removed along
 * with the rest of the Mongo path) already had to work around. Left
 * uncorrected, a corrupted name produces a different
 * nameKey() than the same person's clean spelling elsewhere, so matching
 * logic treats them as two different people — confirmed the hard way
 * 2026-09-09, when this created two real duplicate rows in production
 * (FERREIRA¬HEIRENS Jaden, PESIKAS¬PETERSONS Tomass — both already
 * existed under their clean spelling). Applied once here, at the point
 * every consumer reads a PlayerHistory from, rather than at each call site
 * that happens to use a name today.
 */
function sanitizeHistoryNames(history: PlayerHistory): PlayerHistory {
  const clean = (name: string) => name.replace(/¬/g, "-");
  history.player.name = clean(history.player.name);
  for (const m of history.unifiedMatches) {
    m.playerName = clean(m.playerName);
    m.opponentName = clean(m.opponentName);
  }
  for (const s of history.seasons) {
    for (const m of s.unifiedMatches) {
      m.playerName = clean(m.playerName);
      m.opponentName = clean(m.opponentName);
    }
  }
  return history;
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
    const token = continuationToken;
    const page = await withR2Retry((abortSignal) =>
      client.send(
        new ListObjectsV2Command({
          Bucket: bucket,
          Prefix: "player-histories/",
          ContinuationToken: token,
        }),
        { abortSignal },
      ),
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
  earliestKnownClass: PlayerClass | null;
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
   * `players` collection's ranking crawl would show "today". Falls back to
   * the plain-text `playerRanking` off their most recent graded match when
   * no row ever carried a parseable snapshot (see parseFlttMatchSnapshot) —
   * confirmed for real 2026-10-02: a whole season's worth of newcomers
   * (every match missing the JSON snapshot format entirely, not just an
   * occasional row) were silently invisible to `syncR2CatalogToSupabase`'s
   * new-player insertion otherwise, since `ranking` stayed blank — see
   * `hasRealPerformanceScore` for why that fallback doesn't extend to PFW
   * too. */
  ranking: string;
  performanceScore: number;
  /** False when `ranking` came from the plain-text fallback above rather
   * than a real snapshot — there's no parallel fallback for a numeric PFW
   * (nothing else on a match row estimates one), so `performanceScore` is
   * meaningless (left 0) whenever this is false. `syncR2CatalogToSupabase`
   * uses this to insert a brand-new player on `ranking` class alone (with a
   * median-PFW-for-that-class placeholder) while still never using a
   * placeholder to clobber an EXISTING player's real recorded PFW. */
  hasRealPerformanceScore: boolean;
  /** Most recent parseable classement-points value (C1-D3 estimates only —
   * see lib/conversions.ts), from the same snapshot mechanism as
   * ranking/performanceScore but not necessarily the same row. Null when no
   * row ever carried one — most rows don't. */
  classementPoints: number | null;
  /** Most recent isoDate among this player's own graded (won !== null)
   * matches, across every season in their file — null if they have none.
   * Used to decide whether an unmatched R2 name is a genuine current
   * new-player candidate (see r2-catalog-sync.ts) rather than someone from
   * a decade-old, no-longer-relevant record. */
  lastMatchIsoDate: string | null;
}

// The season currently being played, as opposed to MONGO_SEASON/SEASON_LABEL
// in ttr-simulation-io.ts (the last *completed* season the DTR simulation
// works from). Only a sighting from this season counts as real evidence of
// a player's current club — see the loop below.
const CURRENT_CLUB_SEASON = "26-27";

export interface R2ClubSighting {
  club: string;
  isoDate: string;
}

export interface R2CatalogResult {
  catalog: R2CatalogPlayerDoc[];
  /**
   * A player's own current club isn't recorded anywhere in their own R2
   * file — only sometimes as an *opponent's* club on someone else's match
   * row (`performance.opponentClub`). This reverse-indexes every such
   * sighting across the whole bucket, keyed by nameKey(opponentName),
   * keeping the most recent (by isoDate) one. Covers roughly half of all
   * players in practice — many players never show up carrying an opponent
   * performance row. Callers must treat a missing entry as "unknown", never
   * as "no club" — see r2-catalog-sync.ts for why.
   */
  clubByNameKey: Map<string, R2ClubSighting>;
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
 *
 * Does one single pass over every player file — also used to build the
 * opponent-club reverse index (see R2CatalogResult.clubByNameKey) rather
 * than scanning the whole bucket a second time for that.
 */
export async function fetchCatalogFromR2(
  onProgress?: (done: number, total: number) => void,
): Promise<R2CatalogResult> {
  const keys = await listAllPlayerHistoryKeys();
  const playerIds = keys
    .map((k) => k.match(/([0-9]+)\.json$/)?.[1])
    .filter((id): id is string => id != null);

  const clubByNameKey = new Map<string, R2ClubSighting>();

  let done = 0;
  const catalog = await mapWithConcurrency(playerIds, 8, async (flttPlayerId) => {
    const history = await fetchPlayerHistoryFromR2(flttPlayerId);
    done++;
    if (onProgress) onProgress(done, playerIds.length);

    for (const m of history.unifiedMatches) {
      // Only the season currently underway counts as evidence of a club
      // change. A stale-but-consistent prior-season club is still stale —
      // dozens of matching 25-26 sightings for a player who transferred
      // clubs over the summer would all agree with each other and all be
      // wrong, actively overwriting an already-correct current club with
      // last season's. Confirmed the hard way 2026-09-09 (LAGUERRE
      // Alexandre/Raphaël, both moved Zolwer -> Bartreng for 26-27 — every
      // R2 sighting for them was from 25-26 and said Zolwer). A player who
      // hasn't yet played a tracked match this season has no reliable club
      // signal at all here, and is correctly left as "unknown" below.
      if (m.season !== CURRENT_CLUB_SEASON) continue;
      const rawClub = m.performance?.opponentClub;
      if (!rawClub || !m.opponentName) continue;
      const club = resolveClubAlias(rawClub);
      const key = nameKey(m.opponentName);
      const existing = clubByNameKey.get(key);
      if (!existing || (m.isoDate && m.isoDate > existing.isoDate)) {
        clubByNameKey.set(key, { club, isoDate: m.isoDate });
      }
    }

    const allSnapshotRows = history.seasons
      .flatMap((s) => s.rencontresRows)
      .filter((r) => r.rowType === "match" && r.points?.startsWith("{"))
      .slice()
      .sort((a, b) => (a.isoDate < b.isoDate ? 1 : a.isoDate > b.isoDate ? -1 : 0)); // newest first

    let ranking = "";
    let performanceScore = 0;
    let hasRealPerformanceScore = false;
    for (const row of allSnapshotRows) {
      const parsed = parseFlttMatchSnapshot(row.points, flttPlayerId);
      if (!parsed || parsed.performance == null) continue;
      ranking = parsed.ranking.trim().toUpperCase();
      performanceScore = parsed.performance;
      hasRealPerformanceScore = true;
      break;
    }

    // Fallback when no row ever carried the richer JSON snapshot at all —
    // confirmed for real 2026-10-02: an entire season's worth of genuine
    // newcomers (37 recently-active players, not an occasional gap) had
    // ranking stuck blank this way, invisible to new-player insertion. The
    // plain-text class off their most recent graded match still reliably
    // exists on every row regardless (see PlayerMatch.rencontres.playerRanking)
    // — there's just no PFW number to go with it, hence
    // hasRealPerformanceScore staying false.
    if (ranking === "") {
      const sortedMatches = history.unifiedMatches
        .filter((m) => m.rencontres?.playerRanking)
        .slice()
        .sort((a, b) => (a.isoDate < b.isoDate ? 1 : a.isoDate > b.isoDate ? -1 : 0)); // newest first
      const latest = sortedMatches[0];
      if (latest) ranking = latest.rencontres.playerRanking.trim().toUpperCase();
    }

    // Independent of the ranking/performance row above — a row can carry one
    // without the other (see parseFlttMatchSnapshot's own doc comment:
    // individual/tournament rows usually have no `points` at all). Same
    // "most recent usable row wins" rule, checked separately.
    let classementPoints: number | null = null;
    for (const row of allSnapshotRows) {
      const parsed = parseFlttMatchSnapshot(row.points, flttPlayerId);
      if (!parsed || parsed.points == null) continue;
      classementPoints = parsed.points;
      break;
    }

    let lastMatchIsoDate: string | null = null;
    for (const m of history.unifiedMatches) {
      if (m.won == null || !m.isoDate) continue;
      if (!lastMatchIsoDate || m.isoDate > lastMatchIsoDate) lastMatchIsoDate = m.isoDate;
    }

    const doc: R2CatalogPlayerDoc = {
      flttPlayerId,
      name: history.player.name,
      club: null,
      ranking,
      performanceScore,
      hasRealPerformanceScore,
      classementPoints,
      lastMatchIsoDate,
    };
    return doc;
  });

  return { catalog, clubByNameKey };
}

/**
 * Maps one player's full R2 history into the shape fetchSeasonData() in
 * ttr-simulation-io.ts needs for the season simulation — match rows,
 * placements, career stats, and a season-start rating snapshot. Since the
 * R2 file already holds the player's entire career across seasons, this
 * needs no cross-season queries at all (the old Mongo path's player-ID
 * batching was purely a Cosmos DB timeout workaround, not needed here).
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

  // A fallback one notch weaker than seasonStartSnapshot: FLTT's export
  // stamps a player's class on every match row's plain `playerRanking`
  // field, even on the (common, for classement-class players especially)
  // rows that don't carry the richer embedded performance/points JSON
  // seasonStartSnapshot needs. Their earliest recorded class this season is
  // still real historical evidence of where they actually started — and a
  // meaningfully better guess than jumping straight to their current
  // catalog class/PFW, which is only "roughly where they ended up" and can
  // reflect a real mid-season promotion (e.g. C2 -> B2) that hadn't
  // happened yet at the point being estimated.
  const matchRowsByDate = (seasonEntry?.rencontresRows ?? [])
    .filter((r) => r.rowType === "match")
    .slice()
    .sort((a, b) => (a.isoDate < b.isoDate ? -1 : a.isoDate > b.isoDate ? 1 : 0));
  let earliestKnownClass: PlayerClass | null = null;
  for (const row of matchRowsByDate) {
    const cls = row.playerRanking.trim().toUpperCase();
    if (isPlayerClass(cls)) {
      earliestKnownClass = cls as PlayerClass;
      break;
    }
  }

  return {
    seasonMatches,
    placements,
    priorSeasonStats: { count: priorMatchCount, lastIsoDate },
    seasonStartSnapshot,
    earliestKnownClass,
  };
}
