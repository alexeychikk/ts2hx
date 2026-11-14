let a = 1;
let b = 2;
[a, b] = [b, a];
console.log(a, b);

let x = 0;
let y = 0;
({ x, y } = { x: 5, y: 6 });
console.log(x, y);

let first: string;
let others: string[];
[first, ...others] = ['p', 'q', 'r'];
console.log(first, others);

const target = { n: 0, s: '' };
const arr = [0, 0];
({ n: target.n, s: target.s } = { n: 42, s: 'set' });
[arr[1], arr[0]] = [11, 22];
console.log(target.n, target.s, arr);

let p = 0;
let q = 0;
[p = 7, q = 8] = [undefined, 3];
console.log(p, q);

let deep = '';
let count = 0;
({ inner: { deep, count = 1 } } = { inner: { deep: 'yes' } } as {
  inner: { deep: string; count?: number };
});
console.log(deep, count);

const source = [9, 8];
const result = ([a, b] = source);
console.log(result === source, a, b);

let i = 0;
let j = 0;
for ([i, j] = [0, 10]; i < 3; i++, j--) {
  console.log(i, j);
}

const order: string[] = [];
function key(name: string): string {
  order.push(name);
  return name;
}
const holder: { [k: string]: number } = {};
[holder[key('one')], holder[key('two')]] = [1, 2];
console.log(order, holder['one'], holder['two']);
