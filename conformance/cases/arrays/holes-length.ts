const words = ['a', 'b', 'c', 'd'];
words.length = 2;
console.log(words, words.length);
words.length = 4;
console.log(words.length, words[3] === undefined, words.join('-'));
const sparse: (number | undefined)[] = [];
sparse[3] = 7;
console.log(sparse.length, sparse[0], sparse[3], sparse.join(','));
const grid = new Array<string>(3);
console.log(grid.length, grid[1], String(grid));
console.log(new Array(2, 3), Array(4).length, Array.of<number>().length);
const filled = new Array<number>(4).fill(0).fill(1, 1, 3);
console.log(filled, filled.length);
const items = ['x', 'y', 'z'];
const n = (items.length = 1);
console.log(n, items, [1, 2, 3].at(5), items[5]);
const nested = [[1, [2, [3, [4]]]], 5];
console.log(nested.flat(), nested.flat(2).length, nested.flat(Infinity));
const values = [NaN, 0, -0, 1];
console.log(
  values.indexOf(NaN),
  values.includes(NaN),
  values.indexOf(-0),
  values.lastIndexOf(0),
);
const stack: number[] = [];
console.log(stack.pop(), stack.shift(), stack.at(0), stack.length);
const extra = [4, 5];
const target = [1];
console.log(target.push(...extra), target.unshift(0, 0.5), target);
const spliced = [1, 2, 3, 4, 5];
console.log(
  spliced.splice(-2),
  spliced.splice(1, 0, 9, 8),
  spliced,
  spliced.splice(1),
);
console.log(
  [1, 2, 3, 4, 5].copyWithin(0, 3),
  [1, 2, 3].reverse(),
  [3, 1, 2].concat(4, [5, 6]),
);
console.log(
  [1, 2, 3].entries().next().value,
  [1, 2, 3].keys().next().value,
  [7].values().next().done,
);
