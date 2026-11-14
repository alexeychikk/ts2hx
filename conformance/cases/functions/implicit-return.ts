function find(xs: number[], t: number): string | undefined {
  for (const x of xs) {
    if (x === t) return 'found';
  }
}
console.log(find([1, 2, 3], 2), find([1, 2, 3], 5));

function sign(n: number) {
  if (n > 0) return 1;
  if (n < 0) return -1;
}
console.log(sign(5), sign(-5), sign(0));

function early(flag: boolean): string | undefined {
  if (flag) return;
  return 'late';
}
console.log(early(true), early(false));

const firstEven = (xs: number[]) => {
  for (const x of xs) {
    if (x % 2 === 0) return x;
  }
};
console.log(firstEven([1, 3, 4]), firstEven([1, 3]));

let calls = 0;
function noop(): void {}
function tick(): void {
  calls++;
}
function relay(): void {
  return tick();
}
console.log(noop());
const r = noop();
console.log(r, typeof r, String(noop()));
relay();
const fromArrow = (() => tick())();
console.log(fromArrow, calls);
const results = [noop(), tick()];
console.log(results.length, calls);
console.log(`[${noop()}]`, calls > 0 ? tick() : 0, calls);

const f: (() => number) | undefined = undefined;
console.log(f ? 1 : 2, !f);
const s: string | undefined = undefined;
console.log(s ? 'yes' : 'no');
const n: number | null = null;
console.log(n ? 'yes' : 'no', !n);
console.log(calls);

let found: number | undefined = undefined;
const setFound = () => {
  found = 2;
};
setFound();
console.log(found ? 'yes' : 'no', !found, `${found}`, String(found));

let last: string | null = null;
const each = (xs: string[], visit: (v: string) => void) => {
  for (const x of xs) visit(x);
};
each(['a', 'b'], (v) => {
  last = v;
});
if (last) console.log('last', last);
console.log(last ? 'set' : 'unset', `${last}`);

let pending: number | undefined = undefined;
console.log(pending ? 'yes' : 'no', `${pending}`, String(pending));
let none: string | null = null;
console.log(none ? 'yes' : 'no', `${none}`);
