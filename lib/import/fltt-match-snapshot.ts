export interface FlttMatchSnapshot {
  ranking: string;
  performance: number | null;
  points: number | null;
}

const CLASSEMENT_MIN = -5.5;
const CLASSEMENT_MAX = 11.5;

/**
 * FLTT doesn't expose a player's per-match class/performance/classement
 * standing as clean fields — on team-competition rows,
 * `rencontresRows.points` instead holds a JSON-encoded string describing
 * that round (both licences, `ranking`, `performance`, and a
 * `points`/`pointsTemp` pair) for the row's own player. Individual/tournament
 * rows carry the same shape but usually without `points`. A row occasionally
 * has a human-readable delta suffix, e.g. `...} (+0.5)`, stripped before
 * parsing.
 */
export function parseFlttMatchSnapshot(
  raw: string | null | undefined,
  ownerFlttId: string,
): FlttMatchSnapshot | null {
  if (!raw || !raw.startsWith("{")) return null;
  const jsonPart = raw.replace(/\s*\([+-][\d.]+\)\s*$/, "");
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonPart);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const obj = parsed as {
    ranking?: unknown;
    performance?: unknown;
    points?: unknown;
    licence1?: { licenceNumber?: unknown };
  };

  // Defensive: the blob is keyed on the row's own player already, but confirm
  // licence1 (when present) really is that player before trusting its values.
  const ownerLicence = obj.licence1?.licenceNumber;
  if (typeof ownerLicence === "string" && ownerLicence !== ownerFlttId) return null;

  if (typeof obj.ranking !== "string" || !obj.ranking.trim()) return null;

  const performanceNum =
    typeof obj.performance === "string" ? Number(obj.performance) : obj.performance;
  const performance =
    typeof performanceNum === "number" && Number.isFinite(performanceNum) ? performanceNum : null;

  const points =
    typeof obj.points === "number" &&
    Number.isFinite(obj.points) &&
    obj.points >= CLASSEMENT_MIN &&
    obj.points <= CLASSEMENT_MAX
      ? obj.points
      : null;

  return { ranking: obj.ranking.trim(), performance, points };
}
