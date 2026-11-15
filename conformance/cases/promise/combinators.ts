function after<T>(ms: number, value: T): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

function failAfter(ms: number, message: string): Promise<never> {
  return new Promise((_, reject) =>
    setTimeout(() => reject(new Error(message)), ms),
  );
}

Promise.all([after(20, 'slow'), after(5, 'fast'), Promise.resolve(3)]).then(
  (values) => console.log('all', values),
);

Promise.all([after(5, 1), failAfter(10, 'all failed'), after(15, 3)]).catch(
  (e: Error) => console.log('all rejected', e.message),
);

Promise.all([]).then((values) => console.log('all empty', values));

Promise.all([1, 2, 3].map((n) => after(n * 3, n * n))).then((squares) => {
  let sum = 0;
  for (const s of squares) sum += s;
  console.log('sum of squares', sum);
});

Promise.allSettled([
  after(10, 'ok'),
  failAfter(5, 'nope'),
  Promise.resolve(42),
]).then((results) => {
  console.log(results.length);
  for (const r of results) {
    if (r.status === 'fulfilled') console.log('fulfilled', r.value);
    else console.log('rejected', (r.reason as Error).message);
  }
});

Promise.race([after(30, 'late'), after(10, 'early')]).then((v) =>
  console.log('race', v),
);

Promise.race([failAfter(5, 'race lost'), after(10, 'too late')]).catch(
  (e: Error) => console.log('race rejected', e.message),
);

Promise.any([failAfter(5, 'a'), after(15, 'b'), after(25, 'c')]).then((v) =>
  console.log('any', v),
);

Promise.any([failAfter(5, 'x'), failAfter(10, 'y')]).catch(
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

const resolved = Promise.resolve('same');
console.log('resolve returns same', Promise.resolve(resolved) === resolved);

console.log('sync done');
