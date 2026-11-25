export type Bar = {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  adjClose: number;
  volume: number;
};

export type Direction = 'above' | 'below';

/** `state` keeps every true session, stepped by the horizon. `spell` keeps the first session of each true run. */
export type Sampler = 'state' | 'spell';

export type StudyConfig = {
  horizon: number;
  discoveryEnd: string;
  holdoutStart: string;
  minEvents: number;
  minSpells: number;
  minHalfEvents: number;
  clusterTBar: number;
};

export type WindowName = 'discovery' | 'holdout';

export type HalfEffect = {
  midpoint: string;
  nA: number;
  nB: number;
  effectA: number | null;
  effectB: number | null;
};

export type SamplerSummary = {
  sampler: Sampler;
  nEvents: number;
  nSpells: number;
  eventMean: number | null;
  effect: number | null;
  clusterT: number | null;
};

export type WindowReport = {
  name: WindowName;
  start: string;
  end: string;
  nEligible: number;
  nEvents: number;
  nSpells: number;
  nComplement: number;
  eventMean: number | null;
  eventMedian: number | null;
  baselineMean: number | null;
  baselineMedian: number | null;
  baselineStd: number | null;
  complementMean: number | null;
  effect: number | null;
  ratio: number | null;
  effectOverStd: number | null;
  welchT: number | null;
  clusterT: number | null;
  signedEventMean: number | null;
  signedHitRate: number | null;
  half: HalfEffect | null;
  gates: {
    support: boolean;
    direction: boolean;
    stability: boolean;
    cluster: boolean;
  };
  notable: boolean;
  diagnostic: SamplerSummary;
  events: { date: string; outcome: number }[];
};

export type PredicateResult = {
  family: string;
  familyThesis: string;
  name: string;
  thesis: string;
  params: Record<string, string | number>;
  lookback: number;
  direction: Direction;
  sampler: Sampler;
  predicateId: string;
  codeHash: string;
  familyTrials: number;
  discovery: WindowReport;
  holdout: WindowReport;
};
