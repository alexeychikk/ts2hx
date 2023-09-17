// https://github.com/rxaviers/async-pool/blob/1.x/lib/es7.js
export async function asyncPool<T, Ret>(
  iterable: Iterable<T>,
  iteratorFn: (el: T) => Promise<Ret>,
  { concurrency = Infinity }: { concurrency?: number } = {},
): Promise<Ret[]> {
  const ret = [];
  const executing = new Set();
  for (const item of iterable) {
    // eslint-disable-next-line @typescript-eslint/promise-function-async
    const p = Promise.resolve().then(() => iteratorFn(item));
    ret.push(p);
    executing.add(p);
    const clean = (): boolean => executing.delete(p);
    p.then(clean).catch(clean);
    if (executing.size >= concurrency) {
      await Promise.race(executing);
    }
  }
  return await Promise.all(ret);
}
