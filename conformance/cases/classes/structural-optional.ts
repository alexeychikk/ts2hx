interface Labelled {
  name: string;
  label?: string;
  priority?: number;
}

interface Describable {
  describe(): string;
  note?: string;
}

class Plain {
  constructor(public name: string) {}
}

class WithLabel {
  label = 'tagged';
  constructor(public name: string) {}
}

class Item implements Describable {
  constructor(private title: string) {}
  describe(): string {
    return 'item ' + this.title;
  }
}

class Special extends Item {
  note = 'special';
}

function show(value: Labelled): string {
  const label = value.label ?? 'none';
  const priority = value.priority === undefined ? -1 : value.priority;
  return `${value.name}/${label}/${priority}`;
}

function explain(d: Describable): string {
  return d.note === undefined ? d.describe() : `${d.describe()} (${d.note})`;
}

const plain = new Plain('p');
console.log(show(plain));
console.log(show(new WithLabel('w')));
const list: Labelled[] = [new Plain('q'), { name: 'lit', priority: 2 }];
for (const entry of list) {
  console.log(show(entry));
}
const labelled: Labelled = plain;
console.log(labelled.label === undefined, labelled.priority ?? 0);
labelled.label = 'late';
console.log(show(labelled), plain.name);

const items: Describable[] = [new Item('a'), new Special('b')];
for (const item of items) {
  console.log(explain(item));
}

interface HasArea {
  readonly area: number;
  label?: string;
  greet?(): string;
}
class Sq implements HasArea {
  constructor(private side: number) {}
  get area(): number {
    return this.side * this.side;
  }
}
class Lab {
  get label(): string {
    return 'lab';
  }
  area = 1;
}
const shapes: HasArea[] = [new Sq(3), new Lab(), { area: 2, label: 'lit' }];
for (const s of shapes) {
  console.log(s.area, s.label ?? 'none', s.greet === undefined);
}

interface Greets {
  greet?(): string;
  label?: string;
}
class Quiet implements Greets {}
class Loud extends Quiet {
  greet(): string {
    return 'loud';
  }
}
const loud: Greets = new Loud();
console.log(loud.greet ? loud.greet() : 'none', loud.label ?? 'none');
