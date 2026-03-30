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

// Benchmark points: pairs of [foreignRating, flttPfw]
// Anchored to the FLTT classification thresholds from IR-22:
//   A3: PFW ≥ 360  |  B1: 290–359.99  |  B2: 250–289.99  |  B3: 215–249.99  |  C1: < 215
//
// Germany TTR benchmarks are calibrated from real data: 41 Luxembourg players whose
// German TTR ratings (Lux-Spiller-TTR.xlsx) were matched against their FLTT PFW values
// in the Verbandsrangliste 2026-01-01. Linear regression: PFW = 0.596 × TTR − 588 (R² = 0.78).
// Values below TTR 1200 are extrapolated — no data available in that range.
const benchmarks: Record<string, [number, number][]> = {
  'germany-ttr': [
    [0,    0],
    [500,  0],
    [750,  40],
    [1000, 70],
    [1100, 100],
    [1200, 128],  // regression line starts here
    [1300, 187],
    [1400, 247],
    [1500, 306],
    [1600, 366],
    [1700, 426],
    [1800, 485],
    [1900, 545],
    [2000, 604],
    [2100, 664],
    [2300, 783],
    [2500, 902],
    [3000, 1200],
  ],
  'austria-ttr': [
    // Austrian TTR uses the same scale as German TTR — applying the same calibration
    [0,    0],
    [500,  0],
    [750,  40],
    [1000, 70],
    [1100, 100],
    [1200, 128],
    [1300, 187],
    [1400, 247],
    [1500, 306],
    [1600, 366],
    [1700, 426],
    [1800, 485],
    [1900, 545],
    [2000, 604],
    [2100, 664],
    [2300, 783],
    [2500, 902],
    [3000, 1200],
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
    // Dutch rating uses the same scale as German TTR — applying the same calibration
    [0,    0],
    [500,  0],
    [750,  40],
    [1000, 70],
    [1100, 100],
    [1200, 128],
    [1300, 187],
    [1400, 247],
    [1500, 306],
    [1600, 366],
    [1700, 426],
    [1800, 485],
    [1900, 545],
    [2000, 604],
    [2100, 664],
    [2300, 783],
    [2500, 902],
    [3000, 1200],
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
    note: 'Calibrated from 41 Luxembourg players: German TTR vs FLTT PFW (R² = 0.78). Note: PFW also reflects FLTT match activity, so newly registered players may receive a different initial placement from the federation.',
  },
  'austria-ttr': {
    confidence: 'high',
    note: 'Austrian TTR uses the same scale as German TTR. Applying the same calibration (R² = 0.78 on German data). Treat as reliable but unvalidated for Austrian players specifically.',
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
    note: 'Dutch rating uses the same scale as German TTR. Applying the same calibration (R² = 0.78 on German data). Treat as reliable but unvalidated for Dutch players specifically.',
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
