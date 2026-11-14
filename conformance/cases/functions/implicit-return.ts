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
