interface Container<T> {
  get(): T;
  size(): number;
}

class Box<T> implements Container<T> {
  constructor(private value: T) {}

  get(): T {
    return this.value;
  }

  size(): number {
    return 1;
  }

  map<U>(fn: (value: T) => U): Box<U> {
    return new Box(fn(this.value));
  }

  static of<V>(value: V): Box<V> {
    return new Box(value);
  }
}

class Stack<T> implements Container<T | undefined> {
  private items: T[] = [];

  push(item: T): this {
    this.items.push(item);
    return this;
  }

  pop(): T | undefined {
    return this.items.pop();
  }

  get(): T | undefined {
    return this.items[this.items.length - 1];
  }

  size(): number {
    return this.items.length;
  }
}

class Pair<A, B = A> {
  constructor(
    readonly first: A,
    readonly second: B,
  ) {}

  swap(): Pair<B, A> {
    return new Pair(this.second, this.first);
  }

  toString(): string {
    return `(${this.first}, ${this.second})`;
  }
}

class NamedBox extends Box<string> {
  constructor(
    value: string,
    readonly label: string,
  ) {
    super(value);
  }

  describe(): string {
    return this.label + '=' + this.get();
  }
}

class Keyed<K, V> extends Pair<K, V[]> {
  count(): number {
    return this.second.length;
  }
}

function sizeOf<T>(container: Container<T>): number {
  return container.size();
}

const box = new Box(21);
const doubled = box.map((n) => n * 2);
console.log(doubled.get(), box.map((n) => 'n' + n).get());
console.log(Box.of('s').get(), Box.of<boolean>(true).get());

const stack = new Stack<number>();
stack.push(1).push(2).push(3);
console.log(stack.pop(), stack.get(), stack.size());
const empty = new Stack<string>();
console.log(empty.pop(), empty.get());

const pair = new Pair(1, 'one');
console.log(pair.toString(), pair.swap().toString());
const same: Pair<number> = new Pair(2, 3);
console.log(same.first + same.second);

const named = new NamedBox('v', 'label');
console.log(named.describe(), named.map((s) => s.toUpperCase()).get());

const keyed = new Keyed('k', [1, 2, 3]);
console.log(keyed.first, keyed.count());

console.log(sizeOf(box), sizeOf(stack), sizeOf(named));
const containers: Container<number>[] = [box, doubled];
console.log(containers.map((c) => c.get()).join(','));

interface Mapper {
  apply<T>(items: T[]): T[];
}

class Reverser implements Mapper {
  apply<T>(items: T[]): T[] {
    return items.slice().reverse();
  }
}

class Doubler extends Reverser {
  override apply<T>(items: T[]): T[] {
    return super.apply(items).concat(items);
  }
}

const mapper: Mapper = new Doubler();
console.log(mapper.apply([1, 2]).join(), new Reverser().apply(['a', 'b']).join(''));

class TreeNode<T extends TreeNode<T>> {
  children: T[] = [];

  add(child: T): this {
    this.children.push(child);
    return this;
  }
}

class Leaf extends TreeNode<Leaf> {
  constructor(readonly tag: string) {
    super();
  }
}

function tags<T extends TreeNode<T> & { tag: string }>(node: T): string {
  return node.tag + '[' + node.children.map((c) => tags(c)).join(',') + ']';
}

const root = new Leaf('root').add(new Leaf('a').add(new Leaf('b')));
console.log(tags(root), root.children.length);
