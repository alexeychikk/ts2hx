class Point {
  constructor(
    public x: number,
    public readonly y: number,
    private label: string = 'p',
    protected weight?: number,
  ) {}
  move(dx: number): void {
    this.x += dx;
  }
  toText(): string {
    return `${this.label}(${String(this.x)}, ${String(this.y)}) w=${String(this.weight)}`;
  }
}

class Point3 extends Point {
  readonly tag: string = 'p3';
  constructor(
    x: number,
    y: number,
    public z: number,
  ) {
    super(x, y, 'q', z * 2);
  }
  override toText(): string {
    return `${super.toText()} z=${String(this.z)} ${this.tag}`;
  }
}

class Mutable {
  readonly value: number = 1;
  readonly kind: string;
  constructor() {
    this.kind = 'base';
  }
}

class Remutable extends Mutable {
  value: number = 2;
  bump(): number {
    this.value += 10;
    return this.value;
  }
}

class Counted extends Point {
  count = 0;
}

const p = new Point(1, 2);
p.move(3);
console.log(p.toText(), p.x, p.y);
const q = new Point3(1, 2, 3);
q.move(-1);
console.log(q.toText(), q.z);
const r = new Remutable();
console.log(r.value, r.kind, r.bump(), r.value);
const c = new Counted(5, 6, 'c', 7);
c.count++;
console.log(c.toText(), c.count);
