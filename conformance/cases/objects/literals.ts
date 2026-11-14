interface Point {
  x: number;
  y: number;
  label?: string;
}

const p: Point = { x: 1, y: 2 };
const q: Point = { ...p, label: 'q' };
console.log(p, q);
console.log(p.label === undefined, q.label);

const nested = { a: { b: { c: [1, 2, { d: 'deep' }] } }, f: true };
console.log(nested);
console.log(JSON.stringify(nested));
console.log(
  JSON.stringify({ s: 'x', n: 1.5, arr: [1, 'two'], nil: null }, null, 2),
);

const parsed = JSON.parse('{"z":1,"a":[true,false],"m":{"k":"v"}}') as Record<
  string,
  unknown
>;
console.log(Object.keys(parsed), parsed['m']);

const counter = {
  count: 0,
  increment() {
    this.count++;
    return this;
  },
};
console.log(counter.increment().increment().count);
