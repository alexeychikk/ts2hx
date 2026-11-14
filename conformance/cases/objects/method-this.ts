interface Counter {
  count: number;
  step: number;
  increment(): number;
  describe(): string;
}

const counter: Counter = {
  count: 0,
  step: 2,
  increment() {
    this.count += this.step;
    return this.count;
  },
  describe() {
    const parts = [1, 2].map((n) => this.count * n);
    return `count=${this.count} doubled=${parts.join(',')}`;
  },
};

function makeStack() {
  return {
    items: [] as string[],
    push(item: string) {
      this.items.push(item);
      return this;
    },
    size() {
      return this.items.length;
    },
  };
}

class Owner {
  name = 'owner';
  build() {
    const outer = this.name;
    return {
      label: 'inner',
      show() {
        return `${this.label} of ${outer}`;
      },
    };
  }
}

counter.increment();
counter.increment();
console.log(counter.count, counter.describe());
const stack = makeStack().push('a').push('b');
console.log(stack.size(), stack.items.join('+'));
console.log(new Owner().build().show());
