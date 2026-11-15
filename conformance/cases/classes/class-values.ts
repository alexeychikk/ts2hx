class Plain {
  n = 7;
}

function factory() {
  return class {
    hello(): string {
      return 'hi';
    }
  };
}

const Made = factory();
console.log(typeof Plain, typeof Made, typeof factory());

console.log(new Made().hello(), new (factory())().hello());
console.log(
  new (class {
    v = 1;
  })().v,
);

function withArgs() {
  return class Named {
    static made = 0;
    constructor(
      public name: string,
      public weight = 1,
    ) {
      Named.made++;
    }
    label(): string {
      return `${this.name}:${this.weight}`;
    }
  };
}
const Labeller = withArgs();
const made = [new Labeller('a'), new Labeller('b', 2)];
console.log(made.map((m) => m.label()).join(' '), Labeller.made);

class Shape {
  constructor(public sides: number) {}
}
class Square extends Shape {
  constructor() {
    super(4);
  }
}
const shapes: (new () => Shape)[] = [Square];
const kinds: (typeof Shape)[] = [Shape];
console.log(
  shapes.map((S) => new S().sides).join(','),
  new kinds[0](3).sides,
  new shapes[0]() instanceof Square,
);

const Alias = Plain;
console.log(new Alias().n, typeof Alias);

class Tag {
  constructor(public text: string) {}
}
const tagClass: typeof Tag = Tag;
const nothing: typeof Tag | null = null;
console.log(new tagClass('t').text, typeof tagClass, typeof nothing);
