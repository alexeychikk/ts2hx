const words = ['the', 'cat', 'and', 'the', 'hat', 'and', 'the', 'bat'];
const counts: Record<string, number> = {};
for (const word of words) {
  counts[word] = (counts[word] ?? 0) + 1;
}
console.log(Object.keys(counts));
console.log(Object.values(counts));
for (const key of Object.keys(counts)) {
  console.log(key, counts[key]);
}
console.log('cat' in counts, 'dog' in counts, counts.the, counts['hat']);

delete counts['cat'];
delete counts.bat;
counts.zebra = 26;
counts['apple'] = 1;
console.log(Object.keys(counts).join(','));
for (const key in counts) {
  console.log(`${key}=${counts[key]}`);
}
console.log(Object.entries(counts)[0], Object.entries(counts).length);

const byId: { [id: number]: string } = { 10: 'ten', 2: 'two' };
byId[1] = 'one';
byId[100] = 'hundred';
console.log(Object.keys(byId), byId[2], byId[3] === undefined, 1 in byId);

const ordered: Record<string, string> = {
  b: 'B',
  2: 'two',
  a: 'A',
  1: 'one',
  '-1': 'minus',
  '01': 'zero-one',
};
console.log(Object.keys(ordered).join(' '));

interface Registry {
  [name: string]: (x: number) => number;
}
const registry: Registry = {
  double: (x) => x * 2,
  square(x) {
    return x * x;
  },
};
registry['negate'] = (x) => -x;
const names = Object.keys(registry);
console.log(
  names,
  registry['double'](4),
  registry.square(5),
  registry.negate(3),
);

function tally(items: string[]): Record<string, number> {
  const result: Record<string, number> = {};
  for (const item of items) {
    if (item in result) {
      result[item] += 1;
    } else {
      result[item] = 1;
    }
  }
  return result;
}
const tallied = tally(['x', 'y', 'x']);
console.log(Object.keys(tallied), tallied.x, tallied.y);

const nested: Record<string, string[]> = {};
nested.list = [];
nested.list.push('a', 'b');
console.log(nested.list.length, nested['list'].join('+'));

interface Stats {
  counts?: Record<string, number>;
}
const stats: Stats = { counts: { z: 26, y: 25 } };
if (stats.counts) {
  stats.counts.x = 24;
  console.log(Object.keys(stats.counts), stats.counts['z'], stats.counts.x);
  for (const key in stats.counts) {
    console.log(key, stats.counts[key]);
  }
}
const maybe: Record<string, number> | undefined = { m: 1 };
console.log(maybe ? Object.values(maybe) : []);
