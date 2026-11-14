const nums = [3, 1, 2];

function double(n: number): number {
  return n * 2;
}
function describe(value: number, index: number): string {
  return `${index}:${value}`;
}
function full(value: number, index: number, array: number[]): number {
  return value + index + array.length;
}
function isOdd(n: number): boolean {
  return n % 2 === 1;
}
function logValue(n: number): void {
  console.log('each', n);
}

console.log(nums.map(double), nums.map(describe), nums.map(full));
console.log(
  nums.map(() => 0),
  nums.map((v, i) => v * i),
  nums.map((v, i, a) => a.length - i + v),
);
console.log(
  nums.filter(isOdd),
  nums.filter((_, i) => i > 0),
  nums.filter((v, i, a) => a.indexOf(v) === i),
);
nums.forEach(logValue);
nums.forEach((v, i) => console.log('forEach', v, i));
console.log(
  nums.some(isOdd),
  nums.every((v, i) => v > i - 5),
  nums.find((_, i) => i === 2),
  nums.findIndex((v, i, a) => v === a[0] && i === 0),
);
console.log(
  nums.reduce((acc, v, i) => acc + v * i, 0),
  nums.reduce((acc, v) => acc + v),
  nums.reduceRight((acc, v, i, a) => acc + v + i + a.length, ''),
);
console.log(
  nums.filter((n) => n % 2),
  nums.find((n) => n - 3),
  nums.some((n) => n - 3),
  nums.every((n) => n),
);
console.log(nums.flatMap((v, i) => [v, i]));
const words = ['b', 'a', 'c'];
console.log(words.map((w, i) => w.repeat(i + 1)).join('|'));
console.log(
  Array.from([1, 2, 3], (v, i) => v * 10 + i),
  Array.from('héllo'),
);
const visited: string[] = [];
const grown = [1, 2];
grown.forEach((v, i, a) => {
  if (a.length < 4) a.push(v * 10);
  visited.push(`${i}=${v}`);
});
console.log(visited.join(' '), grown);
