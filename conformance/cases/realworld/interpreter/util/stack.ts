export class Stack<T> {
  private items: T[] = [];

  push(item: T): this {
    this.items.push(item);
    return this;
  }

  pop(): T {
    const item = this.items.pop();
    if (item === undefined) {
      throw new RangeError('pop from empty stack');
    }
    return item;
  }

  peek(): T | undefined {
    return this.items[this.items.length - 1];
  }

  get size(): number {
    return this.items.length;
  }

  isEmpty(): boolean {
    return this.items.length === 0;
  }

  toArray(): T[] {
    return this.items.slice();
  }
}
