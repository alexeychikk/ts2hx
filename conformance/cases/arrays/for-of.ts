const nums = [1, 2, 3];
let total = 0;
for (const n of nums) {
  total += n;
}
console.log(total);
for (let n of nums) {
  n *= 10;
  console.log('let', n);
}
console.log(nums);
const grow = [1, 2];
for (const n of grow) {
  if (grow.length < 5) grow.push(n * 10);
}
console.log(grow);
for (const ch of 'añ😀b') {
  console.log(ch, ch.length);
}
const pairs = [
  ['a', 1],
  ['b', 2],
] as const;
for (const pair of pairs) {
  console.log(pair[0], pair[1]);
}
outer: for (const row of [
  [1, 2],
  [3, 4],
  [5, 6],
]) {
  for (const cell of row) {
    if (cell === 2) continue outer;
    if (cell === 5) break outer;
    console.log('cell', cell);
  }
}
const callbacks: Array<() => string> = [];
for (const word of ['x', 'y']) {
  callbacks.push(() => word);
}
console.log(callbacks.map((f) => f()).join(''));
function firstEven(values: number[]): number | undefined {
  for (const v of values) {
    if (v % 2 === 0) return v;
  }
  return undefined;
}
console.log(firstEven([1, 3, 4, 6]), firstEven([1]));
for (const s of ['p', 'q'].map((x) => x.toUpperCase())) {
  console.log(s);
}
