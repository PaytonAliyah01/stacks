/**
 * Runs `fn` on each item in turn, never two at once (for work that has to be
 * gentle with a service, or must happen in order). `fn` can return 'stop' to
 * end early.
 */
export async function eachInTurn<T>(items: readonly T[], fn: (item: T, index: number) => Promise<void | 'stop'>): Promise<void> {
  let stopped = false;
  await items.reduce<Promise<void>>(
    (prev, item, i) =>
      prev.then(async () => {
        if (stopped) return;
        if ((await fn(item, i)) === 'stop') stopped = true;
      }),
    Promise.resolve(),
  );
}

export const pause = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Tries each item in turn and returns the first result that isn't empty (later items aren't asked). */
export async function firstInTurn<T, R>(items: readonly T[], fn: (item: T) => Promise<R | null | undefined>): Promise<R | null> {
  let found: R | null = null;
  await eachInTurn(items, async (item) => {
    const r = await fn(item);
    if (r === null || r === undefined) return;
    found = r;
    return 'stop';
  });
  return found;
}
