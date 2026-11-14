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
