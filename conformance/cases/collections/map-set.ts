const m = new Map<string, number>();
m.set('b', 2).set('a', 1).set('c', 3);
m.set('b', 20);
console.log(m.size, m.get('b'), m.get('missing'), m.has('a'));
m.delete('a');
for (const [k, v] of m) {
  console.log(k, v);
}
console.log([...m.keys()], [...m.values()]);
m.forEach((v, k) => console.log(`${k}=${v}`));

const s = new Set<number>([3, 1, 3, 2, 1]);
s.add(NaN).add(NaN);
console.log(s.size, s.has(2), s.has(NaN), [...s]);

const key1 = { id: 1 };
const key2 = { id: 1 };
const byObject = new Map<object, string>([[key1, 'first']]);
byObject.set(key2, 'second');
console.log(byObject.size, byObject.get(key1), byObject.get(key2));
console.log(m, s);
