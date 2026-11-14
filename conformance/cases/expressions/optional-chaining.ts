interface Node {
  value: number;
  next?: Node;
  label?: string;
  children?: Node[];
  visit?: (depth: number) => string;
}

const leaf: Node = { value: 3, label: 'leaf' };
const root: Node = {
  value: 1,
  next: { value: 2, next: leaf },
  children: [leaf],
  visit: (depth) => `visit ${depth}`,
};
const empty: Node | undefined = undefined as Node | undefined;

console.log(root.next?.value, root.next?.next?.next?.value);
console.log(empty?.value, empty?.next?.value);
console.log(root.next?.next?.label?.length);
console.log(root.children?.[0].value, leaf.children?.[0].value);
console.log(root.visit?.(2), leaf.visit?.(3));
console.log(root.label?.toUpperCase(), leaf.label?.toUpperCase());

let calls = 0;
function find(n: number): Node | undefined {
  calls++;
  return n > 0 ? root : undefined;
}
console.log(find(1)?.next?.value, find(0)?.next?.value, calls);

function maybeList(): number[] | null {
  return null;
}
let evaluated = 0;
console.log(maybeList()?.[evaluated++], evaluated);

const fn: ((s: string) => string) | undefined = undefined as
  | ((s: string) => string)
  | undefined;
console.log(fn?.('x'));

console.log(empty?.value ?? -1, root.next?.value ?? -1);
const zero = 0;
const blank = '';
const nothing = null as string | null;
console.log(zero ?? 5, blank ?? 'dflt', nothing ?? 'n');

let maybe: number | undefined;
maybe ??= 4;
maybe ??= 5;
console.log(maybe);

let text = '';
text ||= 'filled';
text ||= 'ignored';
console.log(text);

let flag = 1;
flag &&= 0;
flag &&= 2;
console.log(flag);

const counts: { hits?: number; misses: number } = { misses: 0 };
counts.hits ??= 0;
counts.hits += 1;
counts.misses ||= 9;
console.log(counts.hits, counts.misses);

const cache: Record<string, string> = {};
cache['a'] ??= 'first';
cache['a'] ??= 'second';
console.log(cache['a']);

const arr = [0, 1];
let idx = 0;
arr[idx++] ||= 5;
console.log(arr, idx);

const assigned = (maybe ??= 100);
console.log(assigned);

root.next?.next && console.log('chained truthy');
leaf.visit?.(1);
