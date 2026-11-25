import { canonicalParams, sha256 } from './hash.ts';
import type { PredicateSpec } from './predicates.ts';
import { eventPositions } from './sample.ts';
import { clusteredMeanT, mean, median, sampleStd, welchT } from './stats.ts';
import type {
  Bar,
  Direction,
  HalfEffect,
  PredicateResult,
  Sampler,
  StudyConfig,
  WindowName,
  WindowReport,
} from './types.ts';

type Row = {
  index: number;
  date: string;
  on: boolean;
  signed: number;
  absolute: number;
};

export function runStudy(bars: Bar[], specs: PredicateSpec[], config: StudyConfig): PredicateResult[] {
  if (config.holdoutStart <= config.discoveryEnd) {
    throw new Error('Holdout must start after the discovery window ends.');
  }
  return specs.map((spec) => evaluatePredicate(bars, spec, specs, config));
}

function evaluatePredicate(
  bars: Bar[],
  spec: PredicateSpec,
  specs: PredicateSpec[],
  config: StudyConfig,
): PredicateResult {
  const codeHash = sha256(spec.flags.toString());
  const predicateId = sha256(`${spec.name}|${canonicalParams(spec.params)}|${codeHash}`).slice(0, 16);
  const flags = spec.flags(bars);
  if (flags.length !== bars.length) throw new Error(`${spec.name} returned a flag series of the wrong length.`);
  const rows = buildRows(bars, flags, config.horizon);
  return {
    family: spec.family,
    familyThesis: spec.familyThesis,
    name: spec.name,
    thesis: spec.thesis,
    params: spec.params,
    lookback: spec.lookback,
    direction: spec.direction,
    sampler: spec.sampler,
    predicateId,
    codeHash,
    familyTrials: specs.filter((item) => item.family === spec.family).length,
    discovery: windowReport(rows, 'discovery', bars[0]?.date ?? '', config.discoveryEnd, spec, config),
    holdout: windowReport(rows, 'holdout', config.holdoutStart, bars[bars.length - 1]?.date ?? '', spec, config),
  };
}

function buildRows(bars: Bar[], flags: (boolean | null)[], horizon: number): Row[] {
  const rows: Row[] = [];
  for (let i = 0; i + horizon < bars.length; i += 1) {
    const flag = flags[i];
    if (flag == null) continue;
    const start = bars[i].adjClose;
    const end = bars[i + horizon].adjClose;
    if (!(start > 0) || !(end > 0)) continue;
    const signed = end / start - 1;
    rows.push({ index: i, date: bars[i].date, on: flag, signed, absolute: Math.abs(signed) });
  }
  return rows;
}

function windowReport(
  rows: Row[],
  name: WindowName,
  start: string,
  end: string,
  spec: PredicateSpec,
  config: StudyConfig,
): WindowReport {
  const windowRows = rows.filter((row) => row.date >= start && row.date <= end);
  const trial = summarize(windowRows, spec.sampler, spec.direction, config);
  const other: Sampler = spec.sampler === 'state' ? 'spell' : 'state';
  const diagnostic = summarize(windowRows, other, spec.direction, config);
  return {
    name,
    start: windowRows[0]?.date ?? start,
    end: windowRows[windowRows.length - 1]?.date ?? end,
    ...trial,
    diagnostic: {
      sampler: other,
      nEvents: diagnostic.nEvents,
      nSpells: diagnostic.nSpells,
      eventMean: diagnostic.eventMean,
      effect: diagnostic.effect,
      clusterT: diagnostic.clusterT,
    },
  };
}

function summarize(rows: Row[], sampler: Sampler, direction: Direction, config: StudyConfig) {
  const positions = eventPositions(sampler, rows.map((row) => row.on), config.horizon);
  const eventSet = new Set(positions);
  const events = positions.map((position) => rows[position]);
  const complement = rows.filter((_, index) => !eventSet.has(index));
  const eventOutcomes = events.map((row) => row.absolute);
  const baselineOutcomes = rows.map((row) => row.absolute);
  const complementOutcomes = complement.map((row) => row.absolute);
  const eventMean = mean(eventOutcomes);
  const baselineMean = mean(baselineOutcomes);
  const baselineStd = sampleStd(baselineOutcomes);
  const effect = eventMean == null || baselineMean == null ? null : eventMean - baselineMean;
  const ratio = eventMean == null || baselineMean == null || baselineMean === 0 ? null : eventMean / baselineMean;
  const effectOverStd = effect == null || baselineStd == null || baselineStd === 0 ? null : effect / baselineStd;
  const spells = spellClusters(rows, eventSet);
  const clusterT = baselineMean == null ? null : clusteredMeanT(spells, baselineMean);
  const half = halfEffects(rows, events);
  const directionOk = effect != null && matches(direction, effect);
  const support = events.length >= config.minEvents && spells.length >= config.minSpells;
  const stability =
    half != null &&
    half.nA >= config.minHalfEvents &&
    half.nB >= config.minHalfEvents &&
    half.effectA != null &&
    half.effectB != null &&
    matches(direction, half.effectA) &&
    matches(direction, half.effectB);
  const cluster = directionOk && clusterT != null && Math.abs(clusterT) >= config.clusterTBar && matches(direction, clusterT);
  const signedOutcomes = events.map((row) => row.signed);
  const signedHits = signedOutcomes.filter((value) => value > 0).length;
  return {
    nEligible: rows.length,
    nEvents: events.length,
    nSpells: spells.length,
    nComplement: complement.length,
    eventMean,
    eventMedian: median(eventOutcomes),
    baselineMean,
    baselineMedian: median(baselineOutcomes),
    baselineStd,
    complementMean: mean(complementOutcomes),
    effect,
    ratio,
    effectOverStd,
    welchT: welchT(eventOutcomes, complementOutcomes),
    clusterT,
    signedEventMean: mean(signedOutcomes),
    signedHitRate: events.length === 0 ? null : signedHits / events.length,
    half,
    gates: { support, direction: directionOk, stability, cluster },
    notable: support && directionOk && stability && cluster,
    events: events.map((row) => ({ date: row.date, outcome: row.absolute })),
  };
}

function spellClusters(rows: Row[], eventSet: Set<number>): number[][] {
  const groups: number[][] = [];
  let current: number[] | null = null;
  for (let i = 0; i < rows.length; i += 1) {
    if (!rows[i].on) {
      current = null;
      continue;
    }
    if (current == null) {
      current = [];
      groups.push(current);
    }
    if (eventSet.has(i)) current.push(rows[i].absolute);
  }
  return groups.filter((group) => group.length > 0);
}

function halfEffects(rows: Row[], events: Row[]): HalfEffect | null {
  if (rows.length === 0) return null;
  const midpoint = rows[Math.floor((rows.length - 1) / 2)].date;
  return {
    midpoint,
    nA: events.filter((row) => row.date <= midpoint).length,
    nB: events.filter((row) => row.date > midpoint).length,
    effectA: sideEffect(rows, events, (date) => date <= midpoint),
    effectB: sideEffect(rows, events, (date) => date > midpoint),
  };
}

function sideEffect(rows: Row[], events: Row[], keep: (date: string) => boolean): number | null {
  const eventMean = mean(events.filter((row) => keep(row.date)).map((row) => row.absolute));
  const baselineMean = mean(rows.filter((row) => keep(row.date)).map((row) => row.absolute));
  if (eventMean == null || baselineMean == null) return null;
  return eventMean - baselineMean;
}

function matches(direction: Direction, value: number): boolean {
  return direction === 'above' ? value > 0 : value < 0;
}
