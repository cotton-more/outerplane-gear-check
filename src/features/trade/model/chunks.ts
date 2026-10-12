// Long calculations in the trade sheet (team plan, the picker's gains) run as generators: one yield per piece of work.
// at once (tests, a synchronous caller)
export const runAll = <T>(gen: Generator<void, T>): T => { for (;;) { const r = gen.next(); if (r.done) return r.value; } };

// фоновый расчёт кусками: уступает поток между кусками; signal.abort() — null, без последствий
export function runChunks<T>(gen: Generator<void, T>, signal?: AbortSignal, slice = 8): Promise<T | null> {
  return new Promise((resolve, reject) => {
    const step = () => {
      if (signal?.aborted) { resolve(null); return; }
      try {
        const t0 = performance.now();
        for (;;) {
          const r = gen.next();
          if (r.done) { resolve(r.value); return; }
          if (performance.now() - t0 >= slice) break;
        }
        setTimeout(step, 0);
      } catch (e) { reject(e); }
    };
    setTimeout(step, 0);
  });
}
