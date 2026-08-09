export interface DtrBucket {
  start: number;
  end: number;
  count: number;
}

const BUCKET_WIDTH = 100;

/**
 * Buckets DTR values into fixed 100-point bins (e.g. 1000-1100), covering
 * every bin from the lowest to the highest value present — including empty
 * ones in the middle — so the shape of the distribution isn't broken up by
 * missing bars.
 */
export function bucketizeDtr(values: number[]): DtrBucket[] {
  if (values.length === 0) return [];

  const min = Math.floor(Math.min(...values) / BUCKET_WIDTH) * BUCKET_WIDTH;
  const max = Math.floor(Math.max(...values) / BUCKET_WIDTH) * BUCKET_WIDTH;

  const counts = new Map<number, number>();
  for (let start = min; start <= max; start += BUCKET_WIDTH) counts.set(start, 0);
  for (const v of values) {
    const start = Math.floor(v / BUCKET_WIDTH) * BUCKET_WIDTH;
    counts.set(start, (counts.get(start) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .sort(([a], [b]) => a - b)
    .map(([start, count]) => ({ start, end: start + BUCKET_WIDTH, count }));
}
