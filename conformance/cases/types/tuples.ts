const pair: [string, number] = ['a', 1];
console.log(pair[0].toUpperCase(), pair[1] + 1, pair.length);
pair[1] = pair[1] * 10;
console.log(pair);

function minMax(values: number[]): [number, number] {
  let min = values[0];
  let max = values[0];
  for (const value of values) {
    if (value < min) min = value;
    if (value > max) max = value;
  }
  return [min, max];
}
const range = minMax([3, -1, 7.5, 2]);
console.log(range[0], range[1], range[1] - range[0]);

const entries: Array<[string, number]> = [
  ['x', 1],
  ['y', 2],
];
entries.push(['z', 3]);
let weighted = 0;
for (const entry of entries) {
  weighted += entry[1] * entry[0].length;
  console.log(`${entry[0]}=${entry[1]}`);
}
console.log(weighted, entries.length);

type Labeled = [name: string, age: number, active?: boolean];
const people: Labeled[] = [
  ['ann', 30, true],
  ['bob', 25],
];
for (const person of people) {
  console.log(person[0], person[1] + 1, person[2] === true, person.length);
}

const nestedTuple: [number, [string, boolean]] = [1, ['inner', true]];
console.log(nestedTuple[1][0], nestedTuple[1][1], nestedTuple);

const values: number[] = [10, 20, 30];
let index = 1;
values[index] = values[index] + 5;
values[values.length] = 40;
console.log(values, values[index + 1]);
