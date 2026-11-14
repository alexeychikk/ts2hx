interface Options {
  readonly id: number;
  name: string;
  size?: number;
  tags?: string[];
  verbose?: boolean;
  format?: (value: number) => string;
}

function describe(options: Options): string {
  const size = options.size ?? 10;
  const tags = options.tags ? options.tags.join('|') : 'none';
  const formatted = options.format ? options.format(size) : String(size);
  return `${options.id}:${options.name}:${formatted}:${tags}:${options.verbose === true}`;
}

console.log(describe({ id: 1, name: 'a' }));
console.log(
  describe({
    id: 2,
    name: 'b',
    size: 3,
    tags: ['x', 'y'],
    verbose: true,
    format: (value) => `<${value}>`,
  }),
);

const options: Options = { id: 3, name: 'c' };
options.size = 0;
options.name = options.name + '!';
console.log(describe(options), options.size === 0, options.tags === undefined);
options.size = undefined;
console.log(describe(options));

interface ListNode {
  value: number;
  next?: ListNode;
}

function sum(node: ListNode | undefined): number {
  let total = 0;
  while (node !== undefined) {
    total += node.value;
    node = node.next;
  }
  return total;
}
const list: ListNode = { value: 1, next: { value: 2, next: { value: 3 } } };
console.log(sum(list), sum(list.next), sum(undefined));

interface Counter {
  readonly label: string;
  count(): number;
  increment(by?: number): void;
  reset?: () => void;
}

function makeCounter(label: string): Counter {
  const state = { value: 0 };
  return {
    label,
    count() {
      return state.value;
    },
    increment(by?: number) {
      state.value += by ?? 1;
    },
  };
}

const counter = makeCounter('clicks');
counter.increment();
counter.increment(5);
console.log(counter.label, counter.count(), counter.reset === undefined);

function greet(name?: string, punctuation: string = '!'): string {
  return 'hello ' + (name ?? 'stranger') + punctuation;
}
console.log(greet(), greet('ann'), greet('bob', '?'));

type Point = { x: number; y: number; z?: number };
function norm(point: Point): number {
  const z = point.z === undefined ? 0 : point.z;
  return point.x * point.x + point.y * point.y + z * z;
}
const points: Point[] = [
  { x: 1, y: 2 },
  { x: 1, y: 1, z: 1 },
];
console.log(points.map((point) => norm(point)));
