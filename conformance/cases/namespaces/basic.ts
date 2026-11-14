namespace Geometry {
  export const unit = 1;
  export let created = 0;
  const secret = 'hidden';

  export function square(x: number): number {
    created++;
    return x * x * unit;
  }

  export function describe(): string {
    return `${secret}:${created}`;
  }

  export namespace Shapes {
    export const sides = 4;
    export function perimeter(side: number): number {
      return side * sides * unit;
    }
  }

  console.log('Geometry init', unit, Shapes.sides);
}

namespace Outer.Inner {
  export const depth = 2;
  export function where(): string {
    return 'Outer.Inner@' + depth;
  }
}

namespace Geometry {
  export const twice = square(2) * 2;
}

class Counter {
  count = 0;
  increment(): number {
    this.count += Counter.step;
    return this.count;
  }
}

namespace Counter {
  export const step = 3;
  export function create(): Counter {
    return new Counter();
  }
}

enum Color {
  Red,
  Green,
}

namespace Palette {
  export enum Tone {
    Light = 'light',
    Dark = 'dark',
  }
  export const primary = Color.Green;
}

console.log(Geometry.square(3), Geometry.created, Geometry.describe());
console.log(
  Geometry.Shapes.perimeter(5),
  Geometry.Shapes.sides,
  Geometry.twice,
);
Geometry.created += 10;
console.log(Geometry.created, Geometry.describe());
console.log(Outer.Inner.where(), Outer.Inner.depth);
const counter = Counter.create();
counter.increment();
console.log(counter.increment(), Counter.step);
console.log(Palette.Tone.Dark, Palette.primary, Color[Palette.primary]);
