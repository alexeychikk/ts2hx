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

class Table {
  static readonly rows: string[] = [];
  static size: number;
  static {
    this.size = 2;
    for (let i = 0; i < this.size; i++) {
      Table.rows.push(`row${i}`);
    }
  }
  static {
    Table.size += Table.rows.length;
  }
}
console.log(Table.size, Table.rows.join(','));
