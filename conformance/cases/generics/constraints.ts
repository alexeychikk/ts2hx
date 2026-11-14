interface Named {
  name: string;
}

interface Scored extends Named {
  score: number;
}

class Player implements Scored {
  constructor(
    public name: string,
    public score: number,
  ) {}
}

function greet<T extends Named>(item: T): string {
  return 'hi ' + item.name;
}

function best<T extends Scored>(items: T[]): T | undefined {
  let top: T | undefined = undefined;
  for (const item of items) {
    if (top === undefined || item.score > top.score) top = item;
  }
  return top;
}

function longest<T extends { length: number }>(a: T, b: T): T {
  return b.length > a.length ? b : a;
}

abstract class Shape {
  abstract area(): number;
}

class Square extends Shape {
  constructor(readonly side: number) {
    super();
  }
  area(): number {
    return this.side * this.side;
  }
}

class Circle extends Shape {
  constructor(readonly radius: number) {
    super();
  }
  area(): number {
    return 3 * this.radius * this.radius;
  }
}

function totalArea<S extends Shape>(shapes: S[]): number {
  let total = 0;
  for (const shape of shapes) total += shape.area();
  return total;
}

function largest<S extends Shape>(shapes: S[]): S {
  let result = shapes[0];
  for (const shape of shapes) if (shape.area() > result.area()) result = shape;
  return result;
}

class Registry<T extends Named = Player> {
  private items: T[] = [];

  add(item: T): void {
    this.items.push(item);
  }

  names(): string {
    return this.items.map((i) => i.name).join(',');
  }
}

function merge<A extends object, B extends object>(a: A, b: B): A & B {
  return { ...a, ...b };
}

function clampAll<N extends number>(values: N[], max: number): number[] {
  return values.map((v) => (v > max ? max : v));
}

const players = [new Player('ann', 3), new Player('bob', 9)];
console.log(greet(players[0]), greet({ name: 'literal' }));
const winner = best(players);
console.log(winner?.name, winner?.score);
console.log(best<Player>([]) === undefined);
console.log(best([{ name: 'x', score: 1, extra: true }])?.name);

console.log(longest('abc', 'de'), longest([1, 2], [1, 2, 3]).length);

const squares = [new Square(2), new Square(3)];
console.log(totalArea(squares), largest(squares).side);
console.log(totalArea<Shape>([new Square(1), new Circle(1)]));

const registry = new Registry();
registry.add(new Player('cy', 1));
registry.add(new Player('di', 2));
console.log(registry.names());
const plain = new Registry<Named>();
plain.add({ name: 'eve' });
console.log(plain.names());

const merged = merge({ a: 1 }, { b: 'two' });
console.log(merged.a, merged.b);
console.log(clampAll([1, 5, 10], 6).join(','));

class Catalog<T extends { id: number }> {
  private entries: T[] = [];

  add(entry: T): this {
    this.entries.push(entry);
    return this;
  }

  byId(id: number): T | undefined {
    return this.entries.find((e) => e.id === id);
  }

  ids(): number[] {
    return this.entries.map((e) => e.id);
  }
}

const catalog = new Catalog<{ id: number; title: string }>();
catalog.add({ id: 7, title: 'seven' }).add({ id: 3, title: 'three' });
console.log(catalog.ids().join(','), catalog.byId(3)?.title, catalog.byId(4));

function withDefault<T extends string | number = string>(value: T): string {
  return `[${value}]`;
}
console.log(withDefault('s'), withDefault(5));
