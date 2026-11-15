const items: any[] = [1, 'a', 2, 3.5];
let total = 0;
for (const v of items) if (typeof v === 'number') total += v;
const x: any = 7;
const y: any = '2';
console.log(total, x > 5, x <= 7, x + 1, x * 2, 's' + x, x - y, 10 - x, y < '3');
let s: any = 'ab';
s += 1;
console.log(s);

function sum(values: any[]): number {
  let result = 0;
  for (const value of values) result += value;
  return result;
}
console.log(sum([1, 2, 3.5]));

const values: any[] = [3, '10', '9', true, undefined, [1, 2], { a: 1 }, ''];
for (const a of values) {
  const row: unknown[] = [];
  for (const b of values) {
    row.push(a + b, a - b, a < b, a >= b);
  }
  console.log(row);
}

const n: any = '6';
const u: any = undefined;
console.log(n * y, n / 4, n % 4, n ** 2, 2 ** n, n | 1, n & 3, n ^ 5);
console.log(n << 1, n >> 1, -n >>> 28, -n, +n, ~n, 1 + n, n + 1);
console.log('10' < '9', y > 1, y >= '2', x > u, x < NaN);

let m: any = 5;
m -= y;
m *= 3;
m /= 2;
m %= 4;
m **= 2;
m |= 8;
m <<= 1;
console.log(m);

const box: { value: any; count: number } = { value: 'x', count: 1 };
box.value += 2;
box.count += x;
box.count -= y;
console.log(box.value, box.count);

const cells: any[] = [1, 'b'];
let i = 0;
cells[i++] += 4;
cells[i++] += 4;
console.log(cells, i);

class Counter {
  static hits: any = 0;
  total: number = 0;
}
Counter.hits += 1;
Counter.hits += '!';
const counter = new Counter();
counter.total += x;
counter.total |= 8;
console.log(Counter.hits, counter.total);
