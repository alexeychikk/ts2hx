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

class Labelled {
  constructor(public label: string) {}
}

function relabel(b: Labelled, suffix: string): string {
  class Reader {
    read(): string {
      return b.label + suffix;
    }
  }
  return new Reader().read();
}
console.log(relabel(new Labelled('l'), '#'));

function inherit(k: number, m: string): string[] {
  class A {
    v(): number {
      return k;
    }
  }
  class B extends A {}
  class C extends A {
    constructor() {
      super();
    }
    w(): string {
      return m + this.v();
    }
  }
  class D extends C {
    tag = m + k;
  }
  const d = new D();
  return [`${new B().v()}`, new C().w(), d.w(), d.tag];
}
console.log(inherit(5, 'x').join(' '), inherit(6, 'y').join(' '));

class Failure {
  constructor(public message: string) {}
}

function errorClass(prefix: string, fallback: string) {
  class Tagged extends Failure {
    readonly kind: string;
    constructor(detail: string = fallback + prefix) {
      const full = prefix + ': ' + detail;
      super(full);
      this.kind = prefix;
    }
  }
  return [new Tagged('boom'), new Tagged()];
}
for (const e of errorClass('E', 'none')) {
  console.log(e.message, e.kind, e instanceof Failure);
}

function factory(greeting: string) {
  return class {
    static kind = 'made';
    hello(): string {
      return greeting;
    }
  };
}
const Made = factory('hi');
console.log(Made !== null, Made.kind);

function stdNamed(): number {
  class Date {
    v = 3;
  }
  class Map {
    w = 4;
  }
  return new Date().v + new Map().w;
}
console.log(stdNamed());

class Lambda {
  k = 1;
}
interface Xml {
  x: number;
}
const xml: Xml = { x: 2 };
console.log(new Lambda().k, xml.x);
