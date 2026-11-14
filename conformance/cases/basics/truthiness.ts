const values: unknown[] = [
  0,
  1,
  -0,
  NaN,
  '',
  'a',
  null,
  undefined,
  [],
  {},
  false,
  true,
];
for (const v of values) {
  console.log(String(v), v ? 'truthy' : 'falsy', !v, !!v);
}
const n = 0;
const s = '';
console.log(n || 42, s || 'default', n ?? 42, s ?? 'default');
console.log(1 && 'yes', 0 && 'yes');
