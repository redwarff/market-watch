import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadSpySnapshot, snapshotPath } from './dataset.ts';
import { CALIBRATION, calibrationSpecs } from './predicates.ts';
import { renderReport } from './report.ts';
import { openLedger, saveStudy } from './store.ts';
import { runStudy } from './study.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = path.join(root, 'data');

async function main(): Promise<void> {
  const refresh = process.argv.includes('--refresh');
  const snapshot = await loadSpySnapshot(dataDir, refresh);
  const results = runStudy(snapshot.bars, calibrationSpecs(), CALIBRATION);
  const searchId = randomUUID();
  const createdAt = new Date().toISOString();
  mkdirSync(dataDir, { recursive: true });
  const ledgerFile = path.join(dataDir, 'ledger.sqlite');
  const db = openLedger(ledgerFile);
  try {
    saveStudy(db, searchId, snapshot, results, createdAt);
  } finally {
    db.close();
  }
  const report = renderReport(snapshot, results, searchId, ledgerFile);
  writeFileSync(path.join(dataDir, 'last-report.txt'), report);
  console.log(report);
  console.log(`snapshot ${snapshotPath(dataDir)}`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
