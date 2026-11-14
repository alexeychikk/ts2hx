function* range(start: number, end: number, step = 1): Generator<number> {
  for (let i = start; i < end; i += step) {
    yield i;
  }
}
console.log([...range(0, 5)], [...range(1, 10, 3)]);

function* counter(): Generator<number, string, number | undefined> {
  let total = 0;
  while (total < 10) {
    const received = yield total;
    total += received ?? 1;
  }
  return 'finished';
}
const gen = counter();
console.log(gen.next(), gen.next(4), gen.next(), gen.next(10), gen.next());

function* inner() {
  yield 'a';
  yield 'b';
  return 'inner done';
}
function* outer() {
  const result: string = yield* inner();
  yield result;
  yield 'c';
}
console.log(Array.from(outer()).join(','));

function* withFinally() {
  try {
    yield 1;
    yield 2;
  } finally {
    console.log('cleanup');
  }
}
for (const v of withFinally()) {
  console.log('value', v);
  break;
}

class Bag implements Iterable<string> {
  private items = ['x', 'y'];
  *[Symbol.iterator](): Iterator<string> {
    yield* this.items;
  }
}
console.log([...new Bag()]);
