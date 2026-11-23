import { startWorker } from '@/server/worker';

/** Start the quote and alert worker once inside the Node server. */
export function bootWorker() {
  if (process.env.NEXT_PHASE === 'phase-production-build') return;
  if (process.env.npm_lifecycle_event === 'build') return;
  startWorker();
}
