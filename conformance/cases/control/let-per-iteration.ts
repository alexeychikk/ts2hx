const fns: Array<() => number> = [];
for (let i = 0; i < 3; i++) {
  fns.push(() => i);
}
console.log(fns.map((f) => f()).join(','));

const skips: Array<() => string> = [];
for (let i = 0, j = 10; i < 5; i++, j--) {
  if (i % 2 === 1) continue;
  skips.push(() => i + ':' + j);
}
console.log(skips.map((f) => f()).join(','));

const mutated: Array<() => number> = [];
for (let i = 0; i < 6; i++) {
  mutated.push(() => i);
  i++;
}
console.log(mutated.map((f) => f()).join(','));

const ofs: Array<() => string> = [];
for (const s of ['x', 'y', 'z']) {
  ofs.push(() => s);
}
console.log(ofs.map((f) => f()).join(','));

const letOfs: Array<() => number> = [];
for (let v of [1, 2, 3]) {
  v *= 10;
  letOfs.push(() => v);
}
console.log(letOfs.map((f) => f()).join(','));

const whiles: Array<() => number> = [];
let w = 0;
while (w < 3) {
  const copy = w;
  let twice = w * 2;
  whiles.push(() => copy + twice);
  w++;
}
console.log(whiles.map((f) => f()).join(','));

const shared: Array<() => number> = [];
let outer = 0;
for (; outer < 3; outer++) {
  shared.push(() => outer);
}
console.log(shared.map((f) => f()).join(','));

const labelled: Array<() => string> = [];
rows: for (let r = 0; r < 3; r++) {
  for (let c = 0; c < 3; c++) {
    if (c > r) continue rows;
    labelled.push(() => r + '' + c);
  }
}
console.log(labelled.map((f) => f()).join(','));

const counters: Array<() => number> = [];
for (let i = 0; i < 3; i++) {
  counters.push(() => ++i);
}
console.log(
  counters.map((f) => f()).join(','),
  counters.map((f) => f()).join(','),
);
