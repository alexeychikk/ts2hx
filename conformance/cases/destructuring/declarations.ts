interface Point {
  x: number;
  y: number;
  label?: string;
}

interface Box {
  name: string;
  origin: Point;
  size: { w: number; h: number };
  tags: string[];
}

const box: Box = {
  name: 'crate',
  origin: { x: 1, y: 2 },
  size: { w: 10, h: 20 },
  tags: ['a', 'b', 'c'],
};

const { name, origin } = box;
console.log(name, origin.x, origin.y);

const {
  origin: { x: left, y: top },
  size: { w, h: height },
  tags: [firstTag, , thirdTag],
} = box;
console.log(left, top, w, height, firstTag, thirdTag);

const { label = 'none', x: px = 99 } = box.origin;
console.log(label, px);

const { name: renamed, ...rest } = box;
console.log(renamed, rest.origin.y, rest.size.w, rest.tags.length);

const [one, two = 2, three = 3] = [1, undefined];
console.log(one, two, three);

const [head, ...tail] = [10, 20, 30, 40];
console.log(head, tail);

const [[a, b], [c, d]] = [
  [1, 2],
  [3, 4],
];
console.log(a + b + c + d);

const pair: [string, number] = ['k', 5];
const [key, value] = pair;
console.log(key, value * 2);

let calls = 0;
function make(): number[] {
  calls++;
  return [7, 8, 9];
}
const [m1, m2] = make();
console.log(m1, m2, calls);

function local(): string {
  const { w: width, h } = box.size;
  let [p, q] = [width, h];
  p += 1;
  var { name: n } = box;
  return `${p} ${q} ${n}`;
}
console.log(local());

function defaultsFromCalls(): void {
  let count = 0;
  const next = () => ++count;
  const [u = next(), v = next()] = [5];
  console.log(u, v, count);
}
defaultsFromCalls();
