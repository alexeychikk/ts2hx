class Point {
  constructor(
    public x: number,
    public y: number,
  ) {}
}

class Labeled extends Point {
  label = 'p';
  extra?: string;
}

class Empty {}

console.log(new Point(1, 2));
console.log(new Labeled(3, 4));
console.log(new Empty());
console.log([new Point(0, 0)], { at: new Point(5, 6) });

console.log({ b: 1, a: 'two', c: [1, 2, 3], d: { e: false, f: 'f' } });
console.log({ deep: { deeper: { deepest: { gone: 1 } } } });
console.log([[1, [2, [3, [4]]]]]);
console.log({ s: "it's", t: 'tab\there', u: '' });
console.log([1.5, -2, NaN, Infinity, true]);

const m = new Map<string, unknown>([
  ['a', 1],
  ['b', { x: [1, 2] }],
]);
console.log(m);
console.log(new Map(), new Set());
console.log(new Set(['x', 'y']), new Set([1, 2, 3]));
console.log({ map: new Map([[1, new Set([2])]]) });
console.log(new Map([[{ k: 1 }, [1]]]));

const longObject = {
  alpha: 'aaaaaaaaaa',
  beta: 'bbbbbbbbbb',
  gamma: 'cccccccccc',
  delta: 'dddddddddd',
  epsilon: 'eeeeeeeeee',
};
console.log(longObject);
console.log(new Map(Object.entries(longObject)));
console.log([longObject, longObject]);

console.log([() => 1, (n: number): number => n]);
