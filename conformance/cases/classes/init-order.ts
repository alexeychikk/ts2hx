const log: string[] = [];

class Base {
  baseField = (log.push('base field'), 1);
  constructor() {
    log.push('base constructor');
    this.init();
  }
  init(): void {
    log.push('base init');
  }
}

class Derived extends Base {
  derivedField = (log.push('derived field'), 2);
  value: number;
  constructor(value: number) {
    log.push('derived constructor start');
    super();
    this.value = value;
    log.push('derived constructor end');
  }
  override init(): void {
    log.push(`derived init sees derivedField=${String(this.derivedField)}`);
  }
}

const d = new Derived(5);
console.log(log.join('\n'));
console.log(d.baseField, d.derivedField, d.value);

abstract class Eager {
  constructor() {
    this.peek();
  }
  abstract peek(): void;
}

class Late extends Eager {
  name: string = 'late';
  count = 3;
  peek(): void {
    console.log(`t:${this.name}`);
    console.log('c:' + this.name, this.name + ':c');
    console.log(String(this.name), `n:${this.count}`);
  }
}

const late = new Late();
late.peek();
console.log(`after:${late.name}`, 'after:' + late.name);

function show(s: string): void {
  console.log('[' + s + ']', `<${s}>`);
  console.log(s);
}
function shout(s: string): string {
  return s + '!';
}

class Shown extends Eager {
  title: string = 'shown';
  peek(): void {
    show(this.title);
    console.log(shout(this.title));
  }
}
new Shown().peek();
