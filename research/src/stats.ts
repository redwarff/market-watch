export function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  let sum = 0;
  for (const value of values) sum += value;
  return sum / values.length;
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid];
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Sample standard deviation. One observation has no sample spread. */
export function sampleStd(values: number[]): number | null {
  if (values.length < 2) return null;
  const center = mean(values);
  if (center == null) return null;
  let sum = 0;
  for (const value of values) {
    const delta = value - center;
    sum += delta * delta;
  }
  return Math.sqrt(sum / (values.length - 1));
}

/**
 * Nearest-rank quantile. Rank is ceil(p * n), then converted to a zero-based index.
 * p = 2/3 and n = 252 selects the 168th smallest value.
 */
export function nearestRankQuantile(values: number[], p: number): number {
  if (values.length === 0) throw new Error('Quantile of an empty sample.');
  if (!(p > 0) || p > 1) throw new Error('Quantile p must be in (0, 1].');
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil(p * sorted.length);
  const index = Math.min(sorted.length - 1, Math.max(0, rank - 1));
  return sorted[index];
}

/** Welch t for the difference of two means. Samples are treated as independent. */
export function welchT(a: number[], b: number[]): number | null {
  if (a.length < 2 || b.length < 2) return null;
  const meanA = mean(a);
  const meanB = mean(b);
  const varA = sampleVariance(a);
  const varB = sampleVariance(b);
  if (meanA == null || meanB == null || varA == null || varB == null) return null;
  const se2 = varA / a.length + varB / b.length;
  if (se2 === 0) return meanA === meanB ? 0 : Math.sign(meanA - meanB) * Infinity;
  return (meanA - meanB) / Math.sqrt(se2);
}

/**
 * Cluster-robust t for a day-weighted event mean against a baseline treated as known.
 * Each inner array is one spell. Days move the mean in proportion to their count, and a
 * spell contributes one piece of sampling noise rather than one piece per day.
 */
export function clusteredMeanT(clusters: number[][], baseline: number): number | null {
  const groups = clusters.filter((group) => group.length > 0);
  if (groups.length < 2) return null;
  const flat: number[] = [];
  for (const group of groups) flat.push(...group);
  const center = mean(flat);
  if (center == null) return null;
  let sumSq = 0;
  for (const group of groups) {
    let total = 0;
    for (const value of group) total += value - center;
    sumSq += total * total;
  }
  const variance = (groups.length / (groups.length - 1)) * sumSq / (flat.length * flat.length);
  if (variance === 0) return center === baseline ? 0 : Math.sign(center - baseline) * Infinity;
  return (center - baseline) / Math.sqrt(variance);
}

function sampleVariance(values: number[]): number | null {
  const spread = sampleStd(values);
  if (spread == null) return null;
  return spread * spread;
}
