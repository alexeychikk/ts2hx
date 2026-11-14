interface Point {
  x: number;
  y: number;
}
interface Point3 extends Point {
  z: number;
}

const p: Point = { x: 1, y: 2 };
const p3: Point3 = { ...p, z: 3 };
console.log(p3.x, p3.y, p3.z);

const moved: Point = { ...p, x: 10 };
console.log(moved.x, moved.y, p.x);

const copy = { ...p3 };
copy.z = 30;
console.log(copy.z, p3.z);

const merged = { a: 1, ...{ b: 'two', c: true }, d: [4] };
console.log(merged.a, merged.b, merged.c, merged.d);

let reads = 0;
function source(): Point {
  reads++;
  return { x: 5, y: 6 };
}
const once = { ...source(), label: 'once' };
console.log(once.x, once.y, once.label, reads);

const order: string[] = [];
function track<T>(name: string, value: T): T {
  order.push(name);
  return value;
}
const evaluated = {
  first: track('first', 1),
  ...track('spread', { second: 2 }),
  third: track('third', 3),
};
console.log(order, evaluated.first, evaluated.second, evaluated.third);

const scores: Record<string, number> = { ann: 1, bob: 2 };
const more: Record<string, number> = { ...scores, cy: 3, ann: 10 };
console.log(more['ann'], more['bob'], more['cy'], scores['ann']);

const list = [1, 2];
const nestedSpread = { values: [...list, 3], ...{ list } };
console.log(nestedSpread.values, nestedSpread.list === list);

function withDefaults(options: { size?: number; color?: string }): {
  size: number;
  color: string;
} {
  return { size: 1, color: 'red', ...options } as { size: number; color: string };
}
console.log(withDefaults({ color: 'blue' }).color, withDefaults({ color: 'blue' }).size);
