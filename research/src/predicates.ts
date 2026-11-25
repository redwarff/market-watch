import { nearestRankQuantile, sampleStd } from './stats.ts';
import type { Bar, Direction, Sampler, StudyConfig } from './types.ts';

export const CALIBRATION: StudyConfig = {
  horizon: 1,
  discoveryEnd: '2018-12-31',
  holdoutStart: '2019-01-01',
  minEvents: 40,
  minSpells: 20,
  minHalfEvents: 10,
  clusterTBar: 2,
};

export const RV_PARAMS = {
  returnLookback: 20,
  thresholdWindow: 252,
  quantile: '2/3',
  quantileMethod: 'nearest-rank',
} as const;

export const NOISE_PARAMS = {
  algorithm: 'fnv1a32',
  modulus: 3,
  remainder: 0,
} as const;

export type PredicateSpec = {
  family: string;
  familyThesis: string;
  name: string;
  thesis: string;
  params: Record<string, string | number>;
  lookback: number;
  direction: Direction;
  sampler: Sampler;
  flags: (bars: Bar[]) => (boolean | null)[];
};

const RV_FAMILY = 'realized-volatility';
const NOISE_FAMILY = 'calendar-noise';

export function calibrationSpecs(): PredicateSpec[] {
  return [
    {
      family: RV_FAMILY,
      familyThesis:
        'Daily absolute moves cluster. A session whose recent realized volatility is unusually high should be followed by a larger absolute move than a typical session.',
      name: 'rv-top-tercile',
      thesis:
        '20-day realized volatility is at or above the nearest-rank two-thirds quantile of its own previous 252 values. The threshold uses only values known at that close.',
      params: { ...RV_PARAMS },
      lookback: RV_PARAMS.returnLookback + RV_PARAMS.thresholdWindow,
      direction: 'above',
      sampler: 'state',
      flags: rvTopTercileFlags,
    },
    {
      family: NOISE_FAMILY,
      familyThesis:
        'A predicate that sees the calendar date and nothing else should not shift the next session\'s absolute return.',
      name: 'date-hash-mod-3',
      thesis:
        'FNV-1a of the session date, modulo 3, equals 0. The rule is fixed and is not fit to prices.',
      params: { ...NOISE_PARAMS },
      lookback: 0,
      direction: 'above',
      sampler: 'state',
      flags: dateHashFlags,
    },
  ];
}

export function familyTrialCount(specs: PredicateSpec[], family: string): number {
  return specs.filter((spec) => spec.family === family).length;
}

/**
 * True when trailing realized volatility is in the top third of its own recent history.
 * Null until both the return window and the threshold window are available.
 */
export function rvTopTercileFlags(bars: Bar[]): (boolean | null)[] {
  const lookback = RV_PARAMS.returnLookback;
  const window = RV_PARAMS.thresholdWindow;
  const returns = logReturns(bars);
  const rv: (number | null)[] = bars.map(() => null);
  for (let i = lookback; i < bars.length; i += 1) {
    const slice: number[] = [];
    let complete = true;
    for (let k = i - lookback + 1; k <= i; k += 1) {
      const value = returns[k];
      if (value == null) {
        complete = false;
        break;
      }
      slice.push(value);
    }
    if (!complete) continue;
    rv[i] = sampleStd(slice);
  }
  return bars.map((_, index) => {
    if (index < lookback + window) return null;
    const current = rv[index];
    if (current == null) return null;
    const history: number[] = [];
    for (let j = index - window; j < index; j += 1) {
      const value = rv[j];
      if (value == null) return null;
      history.push(value);
    }
    return current >= nearestRankQuantile(history, 2 / 3);
  });
}

/** Deterministic date rule. About one session in three, with no price input. */
export function dateHashFlags(bars: Bar[]): (boolean | null)[] {
  return bars.map((bar) => (fnv1a(bar.date) % NOISE_PARAMS.modulus) === NOISE_PARAMS.remainder);
}

function logReturns(bars: Bar[]): (number | null)[] {
  return bars.map((bar, index) => {
    if (index === 0) return null;
    const previous = bars[index - 1].adjClose;
    if (!(previous > 0) || !(bar.adjClose > 0)) return null;
    return Math.log(bar.adjClose / previous);
  });
}

function fnv1a(text: string): number {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
