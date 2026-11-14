interface Options {
  verbose?: boolean;
  depth?: number;
  name: string;
}

function describe({ name, verbose = false, depth = 1 }: Options): string {
  return `${name} verbose=${verbose} depth=${depth}`;
}
console.log(describe({ name: 'a' }));
console.log(describe({ name: 'b', verbose: true, depth: 3 }));

function withDefault({ x, y }: { x: number; y: number } = { x: 1, y: 2 }): number {
  return x * 10 + y;
}
console.log(withDefault(), withDefault({ x: 5, y: 6 }));

function sumPair([first, second]: [number, number]): number {
  return first + second;
}
console.log(sumPair([3, 4]));

function headAndRest([head, ...others]: string[]): string {
  return `${head}|${others.join(',')}`;
}
console.log(headAndRest(['a', 'b', 'c']));

const area = ({ w, h }: { w: number; h: number }) => w * h;
console.log(area({ w: 3, h: 5 }));

const points = [
  { x: 1, y: 2 },
  { x: 3, y: 4 },
];
console.log(points.map(({ x, y }) => x + y));

function nested({ inner: { value = 'dflt' } = {} }: { inner?: { value?: string } }): string {
  return value;
}
console.log(nested({}), nested({ inner: {} }), nested({ inner: { value: 'v' } }));

class Greeter {
  greeting: string;
  constructor({ greeting }: { greeting: string }) {
    this.greeting = greeting;
  }
  greet([who, punct = '!']: [string, string?]): string {
    return `${this.greeting}, ${who}${punct}`;
  }
}
const greeter = new Greeter({ greeting: 'Hi' });
console.log(greeter.greet(['Ann']), greeter.greet(['Bob', '?']));
