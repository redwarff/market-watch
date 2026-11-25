import type { Snapshot } from './dataset.ts';
import type { PredicateResult, WindowReport } from './types.ts';

export function renderReport(snapshot: Snapshot, results: PredicateResult[], searchId: string, ledgerPath: string): string {
  const first = snapshot.bars[0];
  const last = snapshot.bars[snapshot.bars.length - 1];
  const lines: string[] = [];
  lines.push('SPY daily study');
  lines.push(`${first.date} to ${last.date}    ${snapshot.bars.length} bars    sha256 ${snapshot.contentHash.slice(0, 16)}`);
  lines.push(`source ${snapshot.source}    dividends recorded ${snapshot.dividendCount}    splits recorded ${snapshot.splits.length}`);
  lines.push(`search ${searchId}`);
  lines.push(`ledger ${ledgerPath}`);
  lines.push('');
  lines.push('Outcome');
  lines.push('  Next-session absolute total return. Horizon is 1 session.');
  lines.push('  Total return uses the dividend-adjusted close, so a dividend is not recorded as a down day.');
  lines.push('');
  lines.push('Trial sampler');
  lines.push('  State: every eligible session on which the predicate is true.');
  lines.push('  The horizon is 1, so successive forward windows do not share a return.');
  lines.push('  The gate uses a cluster-robust t of the event mean against the unconditional mean.');
  lines.push('  An uninterrupted run of true sessions is one cluster: the days still move the mean,');
  lines.push('  but they do not count as separate pieces of evidence. The baseline mean is treated as known.');
  lines.push('  The day-level Welch t ignores that clumping and is printed only for comparison.');
  lines.push('  The other sampler is a diagnostic and does not enter the gate.');
  lines.push('');
  lines.push('Windows');
  lines.push('  Discovery is every eligible session through 2018-12-31.');
  lines.push('  Holdout is every eligible session from 2019-01-01. It is opened because both predicates are controls.');
  lines.push('');
  lines.push('A window is notable when all four gates pass: at least 40 events and 20 spells,');
  lines.push('the effect is above the baseline, both halves of the window agree on that direction,');
  lines.push('and the cluster-robust t is at least 2. Each family in this search contains one predicate,');
  lines.push('so no further multiple-trial penalty is applied. The count is stored with the run.');
  for (const result of results) {
    lines.push('');
    lines.push('─'.repeat(72));
    lines.push(`${result.name}    ${result.family}    trials in family ${result.familyTrials}`);
    lines.push(result.thesis);
    lines.push(`predicate ${result.predicateId}    lookback ${result.lookback} sessions`);
    lines.push(`params ${JSON.stringify(result.params)}`);
    lines.push('');
    lines.push(formatWindow(result.discovery));
    lines.push('');
    lines.push(formatWindow(result.holdout));
  }
  lines.push('');
  lines.push('─'.repeat(72));
  lines.push(verdict(results));
  lines.push('');
  return lines.join('\n');
}

function formatWindow(window: WindowReport): string {
  const lines = [
    `${window.name}    ${window.start} to ${window.end}`,
    `  eligible ${window.nEligible}    events ${window.nEvents}    spells ${window.nSpells}    complement ${window.nComplement}`,
    `  event mean ${pct(window.eventMean)}    median ${pct(window.eventMedian)}`,
    `  baseline mean ${pct(window.baselineMean)}    median ${pct(window.baselineMedian)}    sd ${pct(window.baselineStd)}`,
    `  complement mean ${pct(window.complementMean)}`,
    `  effect ${signedPct(window.effect)}    ratio ${num(window.ratio)}    effect/sd ${num(window.effectOverStd)}`,
    `  cluster t ${num(window.clusterT)}    day-level welch t ${num(window.welchT)}`,
    `  signed return on the same events ${signedPct(window.signedEventMean)}    P(up) ${num(window.signedHitRate)}`,
  ];
  if (window.half) {
    lines.push(
      `  halves split at ${window.half.midpoint}    effect ${signedPct(window.half.effectA)} (n=${window.half.nA})    ${signedPct(window.half.effectB)} (n=${window.half.nB})`,
    );
  }
  lines.push(
    `  gates  support ${mark(window.gates.support)}  direction ${mark(window.gates.direction)}  stability ${mark(window.gates.stability)}  cluster ${mark(window.gates.cluster)}`,
  );
  lines.push(`  notable ${window.notable ? 'yes' : 'no'}`);
  lines.push(
    `  diagnostic ${window.diagnostic.sampler}    events ${window.diagnostic.nEvents}    spells ${window.diagnostic.nSpells}    effect ${signedPct(window.diagnostic.effect)}    cluster t ${num(window.diagnostic.clusterT)}`,
  );
  return lines.join('\n');
}

function verdict(results: PredicateResult[]): string {
  const vol = results.find((result) => result.name === 'rv-top-tercile');
  const noise = results.find((result) => result.name === 'date-hash-mod-3');
  if (!vol || !noise) return 'Verdict: the calibration pair was not in this search.';
  const volOk = vol.discovery.notable && !noise.discovery.notable;
  if (volOk) {
    return 'Verdict: on discovery, the volatility predicate is notable and the date predicate is not. The instrument separates the control from the nonsense rule.';
  }
  return `Verdict: the calibration pair did not separate as expected. Volatility notable=${vol.discovery.notable}, date-hash notable=${noise.discovery.notable}. Read the gates before treating the ledger as calibrated.`;
}

function mark(pass: boolean): string {
  return pass ? 'pass' : 'fail';
}

function pct(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return 'n/a';
  return `${(value * 100).toFixed(3)}%`;
}

function signedPct(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return 'n/a';
  const body = `${(value * 100).toFixed(3)}%`;
  return value > 0 ? `+${body}` : body;
}

function num(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return 'n/a';
  return value.toFixed(2);
}
