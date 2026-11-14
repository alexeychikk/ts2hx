const nums = [10, 9, 1, 100, 25];
console.log([...nums].sort());
console.log([...nums].sort((a, b) => a - b));
console.log([...nums].sort((a, b) => b - a));
const words = ['banana', 'Apple', 'cherry', 'apple'];
console.log([...words].sort());
console.log(
  [...words].sort((a, b) =>
    a.toLowerCase() < b.toLowerCase()
      ? -1
      : a.toLowerCase() > b.toLowerCase()
        ? 1
        : 0,
  ),
);
const people = [
  { name: 'Ann', age: 30 },
  { name: 'Bob', age: 25 },
  { name: 'Cy', age: 30 },
  { name: 'Di', age: 25 },
];
console.log(
  people
    .sort((a, b) => a.age - b.age)
    .map((p) => p.name)
    .join(','),
);
