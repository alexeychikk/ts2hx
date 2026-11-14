const Point = class {
  constructor(
    public x: number,
    public y: number,
  ) {}
  sum(): number {
    return this.x + this.y;
  }
};

function makeCounter(start: number, step: number) {
  const prefix = 'count';
  class Counter {
    value = start;
    tick(): string {
      this.value += step;
      return `${prefix}=${this.value}`;
    }
  }
  const first = new Counter();
  const second = new Counter();
  first.tick();
  return [first.tick(), second.tick()];
}

function greeters(names: string[]): string[] {
  const punctuation = '!';
  const Greeter = class {
    constructor(private name: string) {}
    greet(): string {
      return 'hi ' + this.name + punctuation;
    }
  };
  return names.map((n) => new Greeter(n).greet());
}

class Base {
  hello(): string {
    return 'base';
  }
}

function derive(suffix: string): Base {
  const Derived = class extends Base {
    override hello(): string {
      return super.hello() + suffix;
    }
  };
  return new Derived();
}

const p = new Point(2, 3);
console.log(p.sum(), p.x, p.y);
console.log(makeCounter(1, 2).join(' '));
console.log(makeCounter(10, -1).join(' '));
console.log(greeters(['a', 'b']).join(' '));
console.log(derive('!').hello(), derive('?').hello());

function withStatic(k: number): number {
  const C = class {
    static make(): number {
      return 1;
    }
    v(): number {
      return k;
    }
  };
  return new C().v() + C.make();
}
console.log(withStatic(4), withStatic(10));
