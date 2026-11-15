const nums = [3, -1, 7];
const a = [5, 4];
const b = [9, 0.5];
const empty: number[] = [];
const order: string[] = [];
function track<T>(label: string, value: T): T {
  order.push(label);
  return value;
}

console.log(Math.min(0, ...nums), Math.max(...nums, 10));
console.log(Math.min(1, ...a, 2, ...b), Math.max(...a, ...b));
console.log(Math.max(...empty, -5), Math.min(...empty), Math.max(...empty));
console.log(Math.hypot(3, ...[4]), Math.hypot(...[6], 8));
console.log(
  Math.max(track('x', 1), ...track('ys', [2, 3]), track('z', 4)),
  order.join(','),
);
console.log(String.fromCharCode(72, ...[105, 33]));
console.log(String.fromCodePoint(...[0x1f600], 33).length);

const pushed = [1];
pushed.push(0, ...a);
pushed.unshift(...b, -2);
console.log(pushed);
console.log(...nums);
console.log('nums:', ...nums, 'end');

function sum(first: number, ...rest: number[]): number {
  return rest.reduce((total, n) => total + n, first);
}
console.log(sum(1, 2, ...a, ...b), sum(1, ...nums, 100));
