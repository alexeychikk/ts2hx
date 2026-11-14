function identity<T>(value: T): T {
  return value;
}

function mapAll<T, U>(items: T[], fn: (item: T, index: number) => U): U[] {
  const out: U[] = [];
  for (let i = 0; i < items.length; i++) {
    out.push(fn(items[i], i));
  }
  return out;
}

function firstOr<T>(items: T[], fallback: T): T {
  return items.length > 0 ? items[0] : fallback;
}

function find<T>(items: T[], test: (item: T) => boolean): T | undefined {
  for (const item of items) {
    if (test(item)) return item;
  }
  return undefined;
}

function compose<A, B, C>(f: (a: A) => B, g: (b: B) => C): (a: A) => C {
  return (a) => g(f(a));
}

function repeat<T = string>(value: T, times: number): T[] {
  const out: T[] = [];
  for (let i = 0; i < times; i++) out.push(value);
  return out;
}

function reduce<T, R>(items: T[], fn: (acc: R, item: T) => R, initial: R): R {
  let acc = initial;
  for (const item of items) acc = fn(acc, item);
  return acc;
}

const pairUp = <K, V>(key: K, value: V): { key: K; value: V } => ({
  key,
  value,
});

function countDown<T>(items: T[], n: number): T[] {
  if (n <= 0) return [];
  return [items[n - 1], ...countDown(items, n - 1)];
}

console.log(identity(42), identity('text'), identity(true));
console.log(identity<number>(1.5) + 1);
console.log(mapAll([1, 2, 3], (n, i) => n * 10 + i).join(','));
console.log(mapAll(['a', 'bb'], (s) => s.length).join('|'));
console.log(firstOr([], 'empty'), firstOr([7, 8], 0));
const found = find([3, 8, 12], (n) => n > 5);
console.log(found, find(['x'], (s) => s === 'y'));
const lengthPlusOne = compose(
  (s: string) => s.length,
  (n) => n + 1,
);
console.log(lengthPlusOne('four'));
console.log(repeat('ab', 3).join(''), repeat<number>(2, 2).join('+'));
console.log(reduce([1, 2, 3, 4], (acc, n) => acc + n, 0));
console.log(reduce(['a', 'b'], (acc: string[], s) => [s, ...acc], []).join(''));
const pair = pairUp('answer', 42);
console.log(pair.key, pair.value + 1);
console.log(countDown(['a', 'b', 'c'], 3).join(''));

function local(): string {
  function wrap<T>(value: T): T[] {
    return [value, value];
  }
  return wrap('w').join('') + wrap(1).length;
}
console.log(local());

const twice: <T>(value: T) => T[] = (value) => [value, value];
const identityRef = identity;
console.log(twice(4).length, identityRef('ref'), [1, 2].map(identity).join());

interface Mapper {
  apply<T>(items: T[]): T[];
}
const reverser: Mapper = {
  apply: (items) => items.slice().reverse(),
};
console.log(reverser.apply([1, 2, 3]).join(''), reverser.apply(['x', 'y']).join(''));
