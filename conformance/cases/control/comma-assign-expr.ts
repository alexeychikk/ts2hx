let a = 0;
let b = 0;
a = b = 5;
console.log(a, b);

let x = 1;
const y = (x++, x++, x * 10);
console.log(x, y);

let count = 0;
let idx = 0;
const next = (): number | undefined =>
  idx < 5 ? (idx++, idx * 2 - 1) : undefined;
let item: number | undefined;
while ((item = next()) !== undefined && item !== 7) {
  count += item;
}
console.log(count, item, idx);

let total = 0;
for (let i = 0, j = 10; i < j; i += 3, j -= 2) {
  total += i * j;
}
console.log(total);

let m = 2;
const doubled = (m *= 3);
console.log(m, doubled);

let s = 'a';
const t = (s += 'b');
console.log(s, t);

function log(v: string): void {
  console.log('log', v);
}
const r = void log('side');
console.log(r === undefined, void 0 === undefined);

const pick = (flag: boolean) => (flag ? (log('yes'), 1) : (log('no'), 2));
console.log(pick(true), pick(false));

let last = 0;
function setLast(v: number): number {
  return (last = v);
}
console.log(setLast(7), last);

let p = 0;
let q = 0;
if ((p = 3) > 2 && (q = p + 1) > 3) {
  console.log('both', p, q);
}

const arr: number[] = [];
let k = 0;
arr.push((k = 4), (k = k * 2));
console.log(arr.join(','), k);

let u: number = 1;
u = (u++, u + 100);
console.log(u);
