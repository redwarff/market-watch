import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { barsHash } from './hash.ts';
import type { Bar } from './types.ts';
import { downloadSpyDaily, type Download } from './yahoo.ts';

export type Snapshot = {
  symbol: 'SPY';
  barSize: '1d';
  source: 'yahoo-chart-v8';
  contentHash: string;
  splits: Download['splits'];
  dividendCount: number;
  bars: Bar[];
};

export function snapshotPath(dataDir: string): string {
  return path.join(dataDir, 'spy-1d.json');
}

export async function loadSpySnapshot(dataDir: string, refresh: boolean): Promise<Snapshot> {
  const file = snapshotPath(dataDir);
  if (!refresh) {
    try {
      return readSnapshot(file);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
  const downloaded = await downloadSpyDaily();
  const snapshot = seal(downloaded);
  assertSpyHistory(snapshot.bars);
  mkdirSync(dataDir, { recursive: true });
  writeFileSync(file, JSON.stringify(snapshot));
  return readSnapshot(file);
}

function seal(downloaded: Download): Snapshot {
  const bars = JSON.parse(JSON.stringify(downloaded.bars)) as Bar[];
  return {
    symbol: 'SPY',
    barSize: '1d',
    source: 'yahoo-chart-v8',
    contentHash: barsHash(bars),
    splits: downloaded.splits,
    dividendCount: downloaded.dividendCount,
    bars,
  };
}

export function readSnapshot(file: string): Snapshot {
  const snapshot = JSON.parse(readFileSync(file, 'utf8')) as Snapshot;
  const hash = barsHash(snapshot.bars);
  if (hash !== snapshot.contentHash) {
    throw new Error('Snapshot hash does not match its bars. The file was changed after it was sealed.');
  }
  assertSpyHistory(snapshot.bars);
  return snapshot;
}

/** Rejects a truncated download and a date-shifted series. The 2018-12-31 close is the published unadjusted close. */
export function assertSpyHistory(bars: Bar[]): void {
  if (bars.length < 8000) throw new Error(`Expected a full daily SPY history, got ${bars.length} bars.`);
  if (bars[0]?.date !== '1993-01-29') throw new Error(`Expected SPY to start on 1993-01-29, got ${bars[0]?.date}.`);
  for (let i = 1; i < bars.length; i += 1) {
    if (bars[i].date <= bars[i - 1].date) throw new Error(`Bar dates are not strictly increasing at ${bars[i].date}.`);
  }
  const known = bars.find((bar) => bar.date === '2018-12-31');
  if (!known || Math.abs(known.close - 249.92) > 0.02) {
    throw new Error(`2018-12-31 close was ${known?.close ?? 'missing'}, expected 249.92.`);
  }
}
