function* numbers(): Generator<number> {
  yield 1;
  yield 2;
  yield 3;
}

class Words implements Iterable<string> {
  *[Symbol.iterator](): Generator<string> {
    yield 'alpha';
    yield 'beta';
  }
}

const set = new Set([3, 1, 3, 2]);
const map = new Map<string, number>([
  ['a', 1],
  ['b', 2],
]);

console.log([...numbers()]);
console.log([0, ...numbers(), 4]);
console.log([...new Words()]);
console.log([...set], [...map], [...map.keys()], [...map.values()]);
console.log([...'héllo']);
console.log([...numbers(), ...set]);
const mixed: Array<string | number> = [...new Words(), ...numbers()];
console.log(mixed);
console.log(Array.from(numbers()), Array.from(new Words()));
console.log(new Set(numbers()).size, new Map(map.entries()).get('b'));
const doubled = [...numbers()].map((n) => n * 2);
console.log(doubled);
const [first, ...rest] = [...numbers()];
console.log(first, rest);
