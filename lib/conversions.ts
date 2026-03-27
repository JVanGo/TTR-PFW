// All conversion formulas here are approximate estimates.
// They should be reviewed and validated by the Luxembourg Table Tennis Federation
// before being used for official placement decisions.

export type ConversionResult = {
  luxembourgRating: number;
  confidence: 'high' | 'medium' | 'low';
  note: string;
};

// Approximate benchmark points: pairs of [foreignRating, luxRating]
// used to build a linear interpolation for each system.
const benchmarks: Record<string, [number, number][]> = {
  'germany-ttr': [
    [0, 0],
    [500, 480],
    [1000, 975],
    [1500, 1470],
    [2000, 1960],
    [2500, 2450],
    [3000, 2900],
  ],
  'austria-ttr': [
    // Austrian TTR is closely related to German TTR
    [0, 0],
    [500, 475],
    [1000, 970],
    [1500, 1460],
    [2000, 1950],
    [2500, 2440],
    [3000, 2890],
  ],
  'belgium-index': [
    // Belgian Index runs 0–10 (roughly logarithmic in skill)
    [0, 0],
    [2, 500],
    [4, 800],
    [5, 1000],
    [6, 1200],
    [7, 1450],
    [8, 1700],
    [9, 2100],
    [10, 2600],
  ],
  'france-classement': [
    [0, 0],
    [500, 650],
    [750, 875],
    [1000, 1050],
    [1500, 1400],
    [2000, 1850],
    [2500, 2300],
    [2800, 2700],
  ],
  'netherlands-rating': [
    [0, 0],
    [500, 490],
    [1000, 980],
    [1500, 1475],
    [2000, 1965],
    [2500, 2455],
    [3000, 2900],
  ],
  'ittf-points': [
    [0, 0],
    [500, 900],
    [1000, 1200],
    [2000, 1600],
    [4000, 1900],
    [8000, 2300],
    [15000, 2800],
  ],
};

const confidenceNotes: Record<string, { confidence: ConversionResult['confidence']; note: string }> = {
  'germany-ttr': {
    confidence: 'high',
    note: 'German TTR is structurally similar to the Luxembourg system. This estimate is relatively reliable.',
  },
  'austria-ttr': {
    confidence: 'high',
    note: 'Austrian TTR is structurally similar to the Luxembourg system. This estimate is relatively reliable.',
  },
  'belgium-index': {
    confidence: 'medium',
    note: 'The Belgian Index uses a different scale. This is a rough estimate — treat with caution.',
  },
  'france-classement': {
    confidence: 'medium',
    note: 'The French Classement uses a different scale to Luxembourg. This estimate may have some variation.',
  },
  'netherlands-rating': {
    confidence: 'high',
    note: 'Dutch rating is structurally similar to the Luxembourg system. This estimate is relatively reliable.',
  },
  'ittf-points': {
    confidence: 'low',
    note: 'ITTF World Ranking points measure international competitive results, not club/league level. This is a rough guide only.',
  },
};

function interpolate(value: number, points: [number, number][]): number {
  if (value <= points[0][0]) return points[0][1];
  if (value >= points[points.length - 1][0]) return points[points.length - 1][1];

  for (let i = 0; i < points.length - 1; i++) {
    const [x0, y0] = points[i];
    const [x1, y1] = points[i + 1];
    if (value >= x0 && value <= x1) {
      const t = (value - x0) / (x1 - x0);
      return Math.round(y0 + t * (y1 - y0));
    }
  }

  return 0;
}

export function convertToLuxembourg(
  systemId: string,
  foreignRating: number
): ConversionResult | null {
  const points = benchmarks[systemId];
  if (!points) return null;

  const meta = confidenceNotes[systemId];
  const luxembourgRating = interpolate(foreignRating, points);

  return {
    luxembourgRating,
    confidence: meta.confidence,
    note: meta.note,
  };
}
