import { DatabaseSync } from 'node:sqlite';
import type { Snapshot } from './dataset.ts';
import type { PredicateResult, WindowReport } from './types.ts';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS datasets (
  id TEXT PRIMARY KEY,
  symbol TEXT NOT NULL,
  bar_size TEXT NOT NULL,
  source TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  bar_count INTEGER NOT NULL,
  content_hash TEXT NOT NULL,
  dividend_count INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY,
  search_id TEXT NOT NULL,
  predicate_id TEXT NOT NULL,
  dataset_id TEXT NOT NULL,
  family TEXT NOT NULL,
  name TEXT NOT NULL,
  thesis TEXT NOT NULL,
  params_json TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  family_trials INTEGER NOT NULL,
  sampler TEXT NOT NULL,
  direction TEXT NOT NULL,
  outcome TEXT NOT NULL,
  window_name TEXT NOT NULL,
  window_start TEXT NOT NULL,
  window_end TEXT NOT NULL,
  n_events INTEGER NOT NULL,
  n_spells INTEGER NOT NULL,
  n_eligible INTEGER NOT NULL,
  event_mean REAL,
  baseline_mean REAL,
  effect REAL,
  cluster_t REAL,
  notable INTEGER NOT NULL,
  stats_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS runs_search ON runs (search_id, name, window_name);

CREATE TABLE IF NOT EXISTS events (
  run_id TEXT NOT NULL,
  symbol TEXT NOT NULL,
  event_date TEXT NOT NULL,
  outcome REAL NOT NULL,
  PRIMARY KEY (run_id, event_date)
);

CREATE TABLE IF NOT EXISTS stacks (
  id TEXT PRIMARY KEY,
  search_id TEXT NOT NULL,
  operator TEXT NOT NULL,
  parent_predicate_ids TEXT NOT NULL,
  child_run_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);
`;

export function openLedger(file: string): DatabaseSync {
  const db = new DatabaseSync(file);
  db.exec(SCHEMA);
  return db;
}

export function saveStudy(db: DatabaseSync, searchId: string, snapshot: Snapshot, results: PredicateResult[], createdAt: string): void {
  const datasetId = snapshot.contentHash.slice(0, 16);
  const insertDataset = db.prepare(`
    INSERT INTO datasets (id, symbol, bar_size, source, start_date, end_date, bar_count, content_hash, dividend_count, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO NOTHING
  `);
  const insertRun = db.prepare(`
    INSERT INTO runs (
      id, search_id, predicate_id, dataset_id, family, name, thesis, params_json, code_hash,
      family_trials, sampler, direction, outcome, window_name, window_start, window_end,
      n_events, n_spells, n_eligible, event_mean, baseline_mean, effect, cluster_t, notable,
      stats_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertEvent = db.prepare(`
    INSERT INTO events (run_id, symbol, event_date, outcome) VALUES (?, ?, ?, ?)
  `);
  db.exec('BEGIN');
  try {
    insertDataset.run(
      datasetId,
      snapshot.symbol,
      snapshot.barSize,
      snapshot.source,
      snapshot.bars[0].date,
      snapshot.bars[snapshot.bars.length - 1].date,
      snapshot.bars.length,
      snapshot.contentHash,
      snapshot.dividendCount,
      createdAt,
    );
    for (const result of results) {
      for (const window of [result.discovery, result.holdout]) {
        const runId = `${searchId}-${result.predicateId}-${window.name}`;
        insertRun.run(
          runId,
          searchId,
          result.predicateId,
          datasetId,
          result.family,
          result.name,
          result.thesis,
          JSON.stringify(result.params),
          result.codeHash,
          result.familyTrials,
          result.sampler,
          result.direction,
          'next-abs-total-return',
          window.name,
          window.start,
          window.end,
          window.nEvents,
          window.nSpells,
          window.nEligible,
          window.eventMean,
          window.baselineMean,
          window.effect,
          window.clusterT,
          window.notable ? 1 : 0,
          JSON.stringify(storedStats(window)),
          createdAt,
        );
        for (const event of window.events) {
          insertEvent.run(runId, snapshot.symbol, event.date, event.outcome);
        }
      }
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

/** Events live in their own table. The run row keeps the summary and the other sampler's diagnostic. */
function storedStats(window: WindowReport): Omit<WindowReport, 'events'> {
  const { events: _events, ...stats } = window;
  return stats;
}
