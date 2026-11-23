export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Spaces calls so a free API key is not burst past its limit. */
export class Pacer {
  private chain: Promise<unknown> = Promise.resolve();

  constructor(private gapMs: number) {}

  run<T>(task: () => Promise<T>): Promise<T> {
    const run = this.chain.then(async () => {
      try {
        return await task();
      } finally {
        await sleep(this.gapMs);
      }
    });
    this.chain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }
}
