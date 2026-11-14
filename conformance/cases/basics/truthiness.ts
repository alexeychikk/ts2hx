const values: unknown[] = [
  0,
  1,
  -0,
  NaN,
  '',
  'a',
  undefined,
  [],
  {},
  false,
  true,
];
for (const v of values) {
  console.log(String(v), v ? 'truthy' : 'falsy', !v, !!v);
}
const nul: null = null;
console.log(String(nul), nul ? 'truthy' : 'falsy', !nul, !!nul);
const n = 0;
const s = '';
console.log(n || 42, s || 'default', n ?? 42, s ?? 'default');
console.log(1 && 'yes', 0 && 'yes');
