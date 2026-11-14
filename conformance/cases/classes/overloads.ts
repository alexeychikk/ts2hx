function pad(value: string, width: number): string;
function pad(value: number, width: number): string;
function pad(value: string | number, width: number): string {
  let text = typeof value === 'number' ? String(value) : value;
  while (text.length < width) {
    text = ' ' + text;
  }
  return text;
}

class Vec {
  x: number;
  y: number;
  constructor();
  constructor(both: number);
  constructor(x: number, y: number);
  constructor(x?: number, y?: number) {
    this.x = x ?? 0;
    this.y = y ?? this.x;
  }

  add(other: Vec): Vec;
  add(dx: number, dy: number): Vec;
  add(a: Vec | number, b?: number): Vec {
    if (a instanceof Vec) {
      return new Vec(this.x + a.x, this.y + a.y);
    }
    return new Vec(this.x + a, this.y + (b ?? 0));
  }

  static of(value: number): Vec;
  static of(x: number, y: number): Vec;
  static of(x: number, y?: number): Vec {
    return y === undefined ? new Vec(x) : new Vec(x, y);
  }

  toString(): string {
    return `(${this.x}, ${this.y})`;
  }
}

console.log(`[${pad('ab', 4)}]`, `[${pad(7, 3)}]`);
console.log(
  new Vec().toString(),
  new Vec(2).toString(),
  new Vec(1, 2).toString(),
);
const v = new Vec(1, 1).add(new Vec(2, 3)).add(10, 20);
console.log(v.toString());
console.log(Vec.of(4).toString(), Vec.of(4, 5).toString());
