import type { Sampler } from './types.ts';

/**
 * First true bar of each run. The next run cannot start until `horizon` bars
 * after that event, so a one-bar blip still waits out the forward window.
 */
export function spellPositions(on: boolean[], horizon: number): number[] {
  const events: number[] = [];
  const step = Math.max(1, horizon);
  let i = 0;
  while (i < on.length) {
    if (!on[i]) {
      i += 1;
      continue;
    }
    events.push(i);
    let end = i + 1;
    while (end < on.length && on[end]) end += 1;
    i = Math.max(end, i + step);
  }
  return events;
}

/** Every true bar, stepped by the horizon so successive forward windows do not overlap. */
export function statePositions(on: boolean[], horizon: number): number[] {
  const events: number[] = [];
  const step = Math.max(1, horizon);
  let i = 0;
  while (i < on.length) {
    if (!on[i]) {
      i += 1;
      continue;
    }
    events.push(i);
    i += step;
  }
  return events;
}

export function eventPositions(sampler: Sampler, on: boolean[], horizon: number): number[] {
  return sampler === 'spell' ? spellPositions(on, horizon) : statePositions(on, horizon);
}
