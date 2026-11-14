class Temperature {
  private celsius = 0;
  get fahrenheit(): number {
    return (this.celsius * 9) / 5 + 32;
  }
  set fahrenheit(value: number) {
    this.celsius = ((value - 32) * 5) / 9;
  }
  get value(): number {
    return this.celsius;
  }
}

class Named {
  private stored = 'anon';
  private writes = 0;
  get name(): string {
    return this.stored;
  }
  set name(value: string) {
    this.writes++;
    if (value === '') {
      return;
    }
    this.stored = value + '!';
  }
  get count(): number {
    return this.writes;
  }
}

abstract class Shape {
  abstract get area(): number;
  get kind(): string {
    return 'shape';
  }
  describe(): string {
    return `${this.kind} with area ${this.area}`;
  }
}

class Square extends Shape {
  constructor(private side: number) {
    super();
  }
  get area(): number {
    return this.side * this.side;
  }
  override get kind(): string {
    return 'square';
  }
}

class Registry {
  static #total = 0;
  static get total(): number {
    return Registry.#total;
  }
  static set total(value: number) {
    Registry.#total = value * 2;
  }
}

const t = new Temperature();
t.fahrenheit = 212;
console.log(t.value, t.fahrenheit);
t.fahrenheit += 18;
console.log(t.value);
t.fahrenheit++;
console.log(t.fahrenheit);

const n = new Named();
console.log(n.name, n.count);
n.name = 'bob';
n.name = '';
console.log(n.name, n.count);
const assigned = (n.name = 'eve');
console.log(assigned, n.name);

const shapes: Shape[] = [new Square(3), new Square(1.5)];
for (const s of shapes) {
  console.log(s.describe());
}

Registry.total = 4;
console.log(Registry.total);
Registry.total += 1;
console.log(Registry.total);

class Vault {
  private code = 7;
  private get doubled(): number {
    return this.code * 2;
  }
  private set doubled(value: number) {
    this.code = value / 2;
  }
  reveal(next: number): string {
    const before = this.doubled;
    this.doubled = next;
    return `${before} ${this.doubled} ${this.code}`;
  }
}
class SubVault extends Vault {
  protected get kind(): string {
    return 'sub';
  }
  label(): string {
    return this.kind + ':' + this.reveal(4);
  }
}
console.log(new Vault().reveal(10), new SubVault().label());
