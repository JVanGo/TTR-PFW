// All conversion formulas here are approximate estimates.
// They should be reviewed and validated by the Luxembourg Table Tennis Federation
// before being used for official placement decisions.

export type FlttClassification = 'A3+' | 'B1' | 'B2' | 'B3' | 'C1';

export type ConversionResult = {
  flttPfw: number;
  classification: FlttClassification;
  confidence: 'high' | 'medium' | 'low';
  note: string;
};

// Approximate benchmark points: pairs of [foreignRating, flttPfw]
// Anchored to the FLTT classification thresholds from IR-22:
//   A3: PFW ≥ 360  |  B1: 290–359.99  |  B2: 250–289.99  |  B3: 215–249.99  |  C1: < 215
const benchmarks: Record<string, [number, number][]> = {
  'germany-ttr': [
    [0, 0],
    [500, 150],
    [750, 185],
    [1000, 220],
    [1200, 252],
    [1350, 290],
    [1600, 335],
    [1800, 375],
    [2000, 440],
    [2200, 515],
    [2500, 590],
    [3000, 710],
  ],
  'austria-ttr': [
    [0, 0],
    [500, 148],
    [750, 182],
    [1000, 218],
    [1200, 250],
    [1350, 288],
    [1600, 332],
    [1800, 372],
    [2000, 436],
    [2200, 510],
    [2500, 585],
    [3000, 705],
  ],
  'belgium-index': [
    [0, 0],
    [2, 150],
    [4, 200],
    [5, 222],
    [6, 265],
    [7, 305],
    [8, 380],
    [9, 470],
    [10, 580],
  ],
  'france-classement': [
    [0, 0],
    [500, 165],
    [750, 200],
    [1000, 225],
    [1200, 252],
    [1500, 310],
    [2000, 400],
    [2500, 500],
    [2800, 580],
  ],
  'netherlands-rating': [
    [0, 0],
    [500, 148],
    [750, 183],
    [1000, 219],
    [1200, 251],
    [1350, 289],
    [1600, 334],
    [1800, 374],
    [2000, 438],
    [2200, 512],
    [2500, 588],
    [3000, 708],
  ],
  'ittf-points': [
    [0, 0],
    [500, 300],
    [1000, 380],
    [2000, 450],
    [4000, 530],
    [8000, 620],
    [15000, 750],
  ],
};

const confidenceNotes: Record<string, { confidence: ConversionResult['confidence']; note: string }> = {
  'germany-ttr': {
    confidence: 'high',
    note: 'German TTR is structurally similar to the FLTT system. This estimate is relatively reliable.',
  },
  'austria-ttr': {
    confidence: 'high',
    note: 'Austrian TTR is structurally similar to the FLTT system. This estimate is relatively reliable.',
  },
  'belgium-index': {
    confidence: 'medium',
    note: 'The Belgian Index uses a different scale. This is a rough estimate — treat with caution.',
  },
  'france-classement': {
    confidence: 'medium',
    note: 'The French Classement uses a different scale to the FLTT system. This estimate may have some variation.',
  },
  'netherlands-rating': {
    confidence: 'high',
    note: 'Dutch rating is structurally similar to the FLTT system. This estimate is relatively reliable.',
  },
  'ittf-points': {
    confidence: 'low',
    note: 'ITTF World Ranking points measure international competitive results, not club/league level. This is a rough guide only.',
  },
};

// Classification thresholds from IR-22 Annex B (Table A — applied when a new ranking is published).
// A1 and A2 are position-based (top 20 and top 21–60), so we report PFW ≥ 360 as 'A3+'.
function classify(pfw: number): FlttClassification {
  if (pfw >= 360) return 'A3+';
  if (pfw >= 290) return 'B1';
  if (pfw >= 250) return 'B2';
  if (pfw >= 215) return 'B3';
  return 'C1';
}

function interpolate(value: number, points: [number, number][]): number {
  if (value <= points[0][0]) return points[0][1];
  if (value >= points[points.length - 1][0]) return points[points.length - 1][1];

  for (let i = 0; i < points.length - 1; i++) {
    const [x0, y0] = points[i];
    const [x1, y1] = points[i + 1];
    if (value >= x0 && value <= x1) {
      const t = (value - x0) / (x1 - x0);
      return Math.round((y0 + t * (y1 - y0)) * 100) / 100;
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
  const flttPfw = interpolate(foreignRating, points);

  return {
    flttPfw,
    classification: classify(flttPfw),
    confidence: meta.confidence,
    note: meta.note,
  };
}
