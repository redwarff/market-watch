import assert from 'node:assert/strict';
import test from 'node:test';
import { dateHashFlags, rvTopTercileFlags } from './predicates.ts';
import { spellPositions, statePositions } from './sample.ts';
import { runStudy } from './study.ts';
import { clusteredMeanT, nearestRankQuantile } from './stats.ts';
import type { Bar, StudyConfig } from './types.ts';
import { calibrationSpecs } from './predicates.ts';

test('spell sampler keeps one event per run and waits out the horizon', () => {
  assert.deepEqual(spellPositions([true, true, true, false, true], 1), [0, 4]);
  assert.deepEqual(spellPositions([true, false, true], 3), [0]);
});

test('state sampler steps by the horizon', () => {
  assert.deepEqual(statePositions([true, true, false, true], 1), [0, 1, 3]);
  assert.deepEqual(statePositions([true, true, true, true], 2), [0, 2]);
});

test('cluster t treats a run of days as one piece of evidence', () => {
  const separated = Array.from({ length: 30 }, () => [0.02]);
  const clumped = [Array.from({ length: 30 }, () => 0.02)];
  assert.ok((clusteredMeanT(separated, 0.005) ?? 0) > 2);
  assert.equal(clusteredMeanT(clumped, 0.005), null);
});

test('nearest-rank quantile uses ceil(p * n)', () => {
  assert.equal(nearestRankQuantile([4, 1, 3, 2], 0.5), 2);
  assert.equal(nearestRankQuantile([1, 2, 3], 2 / 3), 2);
});

test('volatility flags ignore bars that do not exist yet', () => {
  const bars = syntheticBars(3).slice(0, 2500);
  const before = rvTopTercileFlags(bars);
  const extra = syntheticBars(9).slice(0, 80).map((bar, index) => ({
    ...bar,
    date: `2099-06-${String((index % 28) + 1).padStart(2, '0')}`,
  }));
  const after = rvTopTercileFlags(bars.concat(extra));
  assert.deepEqual(after.slice(0, before.length), before);
});

test('planted volatility clustering is notable and the date rule is not', () => {
  const bars = syntheticBars(20261124);
  const cut = Math.floor(bars.length * 0.7);
  const config: StudyConfig = {
    horizon: 1,
    discoveryEnd: bars[cut].date,
    holdoutStart: bars[cut + 1].date,
    minEvents: 40,
    minSpells: 20,
    minHalfEvents: 10,
    clusterTBar: 2,
  };
  const results = runStudy(bars, calibrationSpecs(), config);
  const vol = results.find((result) => result.name === 'rv-top-tercile');
  const noise = results.find((result) => result.name === 'date-hash-mod-3');
  assert.ok(vol && noise);
  assert.equal(vol.discovery.notable, true);
  assert.ok((vol.discovery.eventMean ?? 0) > (vol.discovery.complementMean ?? 1) * 1.3);
  assert.equal(noise.discovery.notable, false);
  assert.ok(Math.abs(noise.discovery.clusterT ?? 99) < 2);
  assert.equal(dateHashFlags(bars).length, bars.length);
});

function syntheticBars(seed: number): Bar[] {
  const random = mulberry32(seed);
  const start = Date.parse('1995-01-03T00:00:00Z');
  let price = 100;
  const bars: Bar[] = [];
  for (let i = 0; i < 6000; i += 1) {
    const wild = Math.floor(i / 30) % 2 === 1;
    price *= Math.exp(gaussian(random) * (wild ? 0.02 : 0.002));
    const date = new Date(start + i * 86400000).toISOString().slice(0, 10);
    bars.push({ date, open: price, high: price, low: price, close: price, adjClose: price, volume: 1 });
  }
  return bars;
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussian(random: () => number): number {
  const u = Math.max(random(), 1e-12);
  const v = random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
