interface Options {
  verbose?: boolean;
  name: string;
  level: number;
}

const opts: Options = { name: 'x', level: 2, verbose: true };
for (const key in opts) {
  console.log(key);
}
console.log('verbose' in opts, 'missing' in opts);
delete opts.verbose;
console.log('verbose' in opts, Object.keys(opts));
for (const key in opts) {
  console.log(key);
}

const scores: { [name: string]: number } = { bob: 3, amy: 5 };
scores['cid'] = 1;
delete scores['bob'];
for (const name in scores) {
  console.log(name, scores[name]);
}

const copy = Object.assign({}, { b: 1, a: 2 }, { c: 3 });
console.log(copy, Object.keys(copy));
const target = { z: 0, y: 0 };
const same = Object.assign(target, { y: 5 });
console.log(same === target, target);

const pairs: Array<[string, number]> = [
  ['one', 1],
  ['two', 2],
];
const fromPairs = Object.fromEntries(pairs);
console.log(fromPairs, fromPairs['two']);

const frozen = Object.freeze({ k: 'v', a: 1 });
console.log(frozen, Object.entries(frozen));

class Item {
  qty = 1;
  constructor(
    public sku: string,
    public price: number,
  ) {}
  total(): number {
    return this.qty * this.price;
  }
}
const item = new Item('a-1', 9.5);
for (const key in item) {
  console.log('item key', key);
}
console.log(Object.keys(item), Object.values(item), item.total());

console.log(1 == ('1' as unknown), null == (undefined as unknown), 0 == ('' as unknown));
console.log((true as unknown) == 1, ('2' as unknown) == 3);
