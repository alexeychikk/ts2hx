class Counter {
  static instances = 0;
  static readonly label = 'counter';
  readonly id: number;
  constructor() {
    Counter.instances++;
    this.id = Counter.instances;
  }
  static create(): Counter {
    return new Counter();
  }
  static describe(): string {
    return `${this.label}: ${this.instances}`;
  }
}

class SubCounter extends Counter {
  static extra = Counter.label + '-sub';
}

const a = Counter.create();
const b = new Counter();
const c = new SubCounter();
console.log(a.id, b.id, c.id);
console.log(Counter.describe(), SubCounter.extra, SubCounter.instances);
