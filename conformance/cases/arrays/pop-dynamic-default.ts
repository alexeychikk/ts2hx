const items: any[] = [1, 'a', 2];
const last = items.pop() ?? 5;
console.log(last, items.length, items);

const mixed: any[] = ['x', 3];
const first = mixed.shift() ?? 7;
console.log(first, mixed.length, mixed);

const empty: any[] = [];
console.log(empty.pop() ?? 9, empty.length);

const unknowns: unknown[] = [4, 'b', 6];
const tail = unknowns.pop() ?? 0;
const head = unknowns.shift() ?? 0;
console.log(tail, head, unknowns.length, unknowns);

const nums: any[] = [10, 20, 30];
const popped: number = nums.pop() ?? 1;
const shifted: number = nums.shift() ?? 1;
const total = popped + shifted;
console.log(total, nums.length, nums);

const queue: any[] = [1, 2];
while (queue.length > 0) {
  const n: number = queue.shift() ?? -1;
  console.log('n', n, queue.length);
}

function popOr(list: any[], fallback: number): number {
  return list.pop() ?? fallback;
}
const arg: any[] = [5, 6];
console.log(popOr(arg, 0), popOr(arg, 0), popOr(arg, 0), arg.length);

const found: any[] = [3, 'q', 8];
const at: number = found.at(-1) ?? 0;
const big: number = found.find((x) => typeof x === 'number' && x > 5) ?? 0;
console.log(at, big, found.length);
