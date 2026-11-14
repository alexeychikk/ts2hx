const pairs: Array<[string, number]> = [
  ['a', 1],
  ['b', 2],
  ['c', 3],
];
for (const [k, v] of pairs) {
  console.log(k, v);
}

interface User {
  id: number;
  name: string;
  role?: string;
}
const users: User[] = [
  { id: 1, name: 'ann', role: 'admin' },
  { id: 2, name: 'bob' },
];
for (const { id, name, role = 'guest' } of users) {
  console.log(id, name, role);
}

const grid = [
  [1, 2, 3],
  [4, 5, 6],
];
let total = 0;
for (let [first, ...rest] of grid) {
  first *= 10;
  total += first + rest.length;
}
console.log(total);

const fns: Array<() => string> = [];
for (const { name } of users) {
  fns.push(() => name);
}
console.log(fns.map((f) => f()));

const entries = [
  { key: 'x', point: { x: 1, y: 2 } },
  { key: 'y', point: { x: 3, y: 4 } },
];
for (const {
  key,
  point: { x, y },
} of entries) {
  console.log(key, x * y);
}

let a = '';
let n = 0;
for ([a, n] of pairs) {
  if (n === 2) continue;
  console.log(a + n);
}
