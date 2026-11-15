class Countdown implements Iterable<number> {
  constructor(private readonly from: number) {}

  [Symbol.iterator](): Iterator<number> {
    let current = this.from;
    return {
      next: (): IteratorResult<number> =>
        current > 0
          ? { value: current--, done: false }
          : { value: undefined, done: true },
    };
  }
}

for (const n of new Countdown(3)) {
  console.log('countdown', n);
}
console.log(Array.from(new Countdown(4)));

class Closable implements Iterator<string> {
  private index = 0;
  constructor(private readonly items: string[]) {}

  next(): IteratorResult<string> {
    if (this.index < this.items.length) {
      return { value: this.items[this.index++], done: false };
    }
    return { value: undefined, done: true };
  }

  return(): IteratorResult<string> {
    console.log('closed at', this.index);
    return { value: undefined, done: true };
  }

  [Symbol.iterator](): Iterator<string> {
    return this;
  }
}

for (const s of new Closable(['p', 'q', 'r'])) {
  console.log('item', s);
  if (s === 'q') break;
}
for (const s of new Closable(['only'])) {
  console.log('item', s);
}

class Grid implements Iterable<[number, number]> {
  constructor(
    private readonly width: number,
    private readonly height: number,
  ) {}

  *[Symbol.iterator](): Iterator<[number, number]> {
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        yield [x, y];
      }
    }
  }
}
for (const [x, y] of new Grid(2, 2)) {
  console.log(`cell ${x},${y}`);
}

class LinkedList<T> implements Iterable<T> {
  private readonly values: T[] = [];

  add(value: T): this {
    this.values.push(value);
    return this;
  }

  *[Symbol.iterator](): Generator<T> {
    for (const v of this.values) yield v;
  }
}
const list = new LinkedList<string>().add('one').add('two');
let joined = '';
for (const item of list) joined += item + ';';
console.log(joined);

const manual = new Countdown(2)[Symbol.iterator]();
console.log(manual.next(), manual.next(), manual.next());
