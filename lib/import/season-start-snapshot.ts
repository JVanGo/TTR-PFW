import type { Db } from "mongodb";
import { estimateTtr, isPlayerClass, type PlayerClass } from "@/lib/conversions";
import { parseFlttMatchSnapshot } from "./fltt-match-snapshot";

const PLAYER_BATCH_SIZE = 100;

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

interface MongoRencontresSnapshotRow {
  flttPlayerId: string;
  isoDate: string;
  points: string | null;
}

interface CandidateSnapshot {
  isoDate: string;
  class: PlayerClass;
  pfw: number;
  classementPoints: number | null;
}

export interface SeasonStartTtr {
  ttr: number;
  isoDate: string;
}

/**
 * A player's class/PFW/classement points drift over the season as FLTT
 * promotes or demotes them and recalculates their score — Supabase's
 * `players` table only ever reflects the latest catalog import, i.e.
 * roughly where a player ended up, not where they started. Each match row
 * already carries the player's own class/performance/points as of that
 * match (see parseFlttMatchSnapshot), so the earliest row in the season that
 * yields a usable estimate gives a real season-start rating instead.
 */
export async function fetchSeasonStartTtr(
  db: Db,
  season: string,
  playerIds: string[],
): Promise<Map<string, SeasonStartTtr>> {
  const candidatesByPlayer = new Map<string, CandidateSnapshot[]>();

  for (const idBatch of chunk(playerIds, PLAYER_BATCH_SIZE)) {
    const rows = await db
      .collection<MongoRencontresSnapshotRow>("rencontresRows")
      .find(
        { flttPlayerId: { $in: idBatch }, season, rowType: "match", points: { $regex: "^\\{" } },
        { projection: { _id: 0, flttPlayerId: 1, isoDate: 1, points: 1 }, maxTimeMS: 55_000 },
      )
      .toArray();
    for (const row of rows) {
      const parsed = parseFlttMatchSnapshot(row.points, row.flttPlayerId);
      if (!parsed) continue;
      const cls = parsed.ranking.trim().toUpperCase();
      if (!isPlayerClass(cls) || parsed.performance == null) continue;
      const candidate: CandidateSnapshot = {
        isoDate: row.isoDate,
        class: cls,
        pfw: parsed.performance,
        classementPoints: parsed.points,
      };
      const list = candidatesByPlayer.get(row.flttPlayerId);
      if (list) list.push(candidate);
      else candidatesByPlayer.set(row.flttPlayerId, [candidate]);
    }
  }

  const result = new Map<string, SeasonStartTtr>();
  for (const [flttId, candidates] of candidatesByPlayer) {
    candidates.sort((a, b) => (a.isoDate < b.isoDate ? -1 : a.isoDate > b.isoDate ? 1 : 0));
    // The earliest candidate is preferred, but a C1-D3 row with no
    // classement points yet (estimateTtr returns null) isn't usable — try
    // the next-earliest instead of silently falling back to today's catalog.
    for (const c of candidates) {
      const ttr = estimateTtr(c.pfw, c.class, c.classementPoints);
      if (ttr != null) {
        result.set(flttId, { ttr, isoDate: c.isoDate });
        break;
      }
    }
  }
  return result;
}
