const nums = [5, 1, 4, 2, 3];
console.log(
  nums.map((n) => n * 2),
  nums.filter((n) => n % 2 === 1),
);
console.log(
  nums.reduce((a, b) => a + b, 0),
  nums.reduceRight((acc, n) => acc + String(n), ''),
);
console.log(
  nums.find((n) => n > 3),
  nums.findIndex((n) => n > 3),
  nums.find((n) => n < 3),
);
console.log(
  nums.some((n) => n > 4),
  nums.every((n) => n > 0),
  nums.includes(4),
  nums.indexOf(9),
);
console.log(nums.slice(1, 3), nums.slice(-2), nums.concat([6, 7]), nums.at(-1));
const copy = [...nums];
console.log(copy.splice(1, 2, 10, 11, 12), copy);
copy.push(99);
copy.unshift(0);
console.log(copy.pop(), copy.shift(), copy.length, copy.reverse());
console.log(
  [
    [1, 2],
    [3, [4]],
  ].flat(),
  [1, 2].flatMap((n) => [n, n * 10]),
);
console.log(
  Array.from({ length: 3 }, (_, i) => i * i),
  Array.of(7, 8),
  Array.isArray(nums),
);
console.log(
  nums.join(' + '),
  [1, [2, 3]].toString(),
  String([null, undefined, 1]),
);
console.log(new Array(3).fill(0), nums.entries().next().value);
