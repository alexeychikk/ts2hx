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
