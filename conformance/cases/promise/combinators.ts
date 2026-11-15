function after<T>(ms: number, value: T): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

function failAfter(ms: number, message: string): Promise<never> {
  return new Promise((_, reject) =>
    setTimeout(() => reject(new Error(message)), ms),
  );
}

Promise.all([after(200, 'slow'), after(50, 'fast'), Promise.resolve(3)]).then(
  (values) => console.log('all', values),
);

Promise.all([after(50, 1), failAfter(100, 'all failed'), after(150, 3)]).catch(
  (e: Error) => console.log('all rejected', e.message),
);

Promise.all([]).then((values) => console.log('all empty', values));

Promise.all([1, 2, 3].map((n) => after(n * 50, n * n))).then((squares) => {
  let sum = 0;
  for (const s of squares) sum += s;
  console.log('sum of squares', sum);
});

Promise.allSettled([
  after(100, 'ok'),
  failAfter(50, 'nope'),
  Promise.resolve(42),
]).then((results) => {
  console.log(results.length);
  for (const r of results) {
    if (r.status === 'fulfilled') console.log('fulfilled', r.value);
    else console.log('rejected', (r.reason as Error).message);
  }
});

Promise.race([after(300, 'late'), after(100, 'early')]).then((v) =>
  console.log('race', v),
);

Promise.race([failAfter(50, 'race lost'), after(100, 'too late')]).catch(
  (e: Error) => console.log('race rejected', e.message),
);

Promise.any([failAfter(50, 'a'), after(150, 'b'), after(250, 'c')]).then((v) =>
  console.log('any', v),
);

Promise.any([failAfter(50, 'x'), failAfter(100, 'y')]).catch(
  (e: AggregateError) => {
    console.log('any rejected', e.message);
    console.log(e.errors.length, (e.errors[1] as Error).message);
  },
);

const thenable = {
  then(resolve: (value: number) => void) {
    console.log('thenable then called');
    resolve(99);
  },
} as unknown as PromiseLike<number>;
Promise.resolve(thenable).then((v) => console.log('thenable', v));
Promise.resolve(1)
  .then(() => thenable)
  .then((v) => console.log('thenable from then', v + 1));

Promise.reject<number>(new Error('reason'))
  .then(
    (v) => v,
    (e: Error) => e.message.length,
  )
  .then((n) => console.log('two-arg then', n));

Promise.all([1, 2, 3]).then((ns) => console.log('plain values', ns));

Promise.allSettled([Promise.resolve(1), Promise.reject('no')]).then((rs) =>
  console.log(rs),
);

console.log(Promise.resolve([1, 'a']), new Promise<number>(() => {}));

const resolved = Promise.resolve('same');
console.log('resolve returns same', Promise.resolve(resolved) === resolved);

console.log('sync done');
