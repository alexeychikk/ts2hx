interface Circle {
  kind: 'circle';
  radius: number;
}
interface Square {
  kind: 'square';
  side: number;
}
interface Rect {
  kind: 'rect';
  width: number;
  height: number;
}
type Shape = Circle | Square | Rect;

function area(shape: Shape): number {
  switch (shape.kind) {
    case 'circle':
      return 3 * shape.radius * shape.radius;
    case 'square':
      return shape.side * shape.side;
    case 'rect':
      return shape.width * shape.height;
  }
}

function label(shape: Shape): string {
  if (shape.kind === 'rect') {
    return `rect ${shape.width}x${shape.height}`;
  }
  return shape.kind === 'circle'
    ? `circle r=${shape.radius}`
    : `square ${shape.side}`;
}

const shapes: Shape[] = [
  { kind: 'circle', radius: 2 },
  { kind: 'square', side: 3 },
  { kind: 'rect', width: 4, height: 1.5 },
];
for (const shape of shapes) {
  console.log(label(shape), area(shape));
}

function describe(value: string | number | boolean): string {
  if (typeof value === 'string') {
    return 'string ' + value.toUpperCase() + ' ' + value.length;
  }
  if (typeof value === 'number') {
    return 'number ' + value * 2;
  }
  return 'boolean ' + (value ? 'yes' : 'no');
}
console.log(describe('abc'), describe(21), describe(false));

interface Fish {
  swim(): string;
  name: string;
}
interface Bird {
  fly(): string;
  name: string;
}

function move(animal: Fish | Bird): string {
  if ('swim' in animal) {
    return animal.name + ' ' + animal.swim();
  }
  return animal.name + ' ' + animal.fly();
}

function isFish(animal: Fish | Bird): animal is Fish {
  return 'swim' in animal;
}

const nemo: Fish = { name: 'nemo', swim: () => 'swims' };
const tweety: Bird = { name: 'tweety', fly: () => 'flies' };
console.log(move(nemo), move(tweety));
for (const animal of [nemo, tweety]) {
  if (isFish(animal)) {
    console.log('fish', animal.swim());
  } else {
    console.log('bird', animal.fly());
  }
}

function total(value: number | number[]): number {
  if (Array.isArray(value)) {
    return value.reduce((sum, x) => sum + x, 0);
  }
  return value;
}
function count(value: string | string[]): number {
  return value instanceof Array ? value.length : 1;
}
console.log(total([1, 2, 3]), total(7), count(['a', 'b']), count('ab'));

type Result = { ok: true; value: number } | { ok: false; error: string };
function parse(text: string): Result {
  return text === 'bad'
    ? { ok: false, error: 'cannot parse ' + text }
    : { ok: true, value: text.length };
}
for (const text of ['four', 'bad']) {
  const result = parse(text);
  if (result.ok) {
    console.log('ok', result.value + 1);
  } else {
    console.log('error', result.error);
  }
}

function lengthOf(text: string | null | undefined): number {
  if (text == null) {
    return -1;
  }
  return text.length;
}
console.log(lengthOf('hello'), lengthOf(null), lengthOf(undefined));

let mutable: string | number = 'start';
console.log(mutable.toUpperCase());
mutable = 41;
console.log(mutable + 1);

function firstOrSelf(value: number | string, fallback: unknown): string {
  if (typeof fallback === 'string') {
    return fallback + ':' + value;
  }
  return typeof value === 'number' ? `n${value + 0.5}` : value;
}
console.log(firstOrSelf(1, 'f'), firstOrSelf(2, 3), firstOrSelf('s', null));
