function greet(name: string, greeting = 'Hello', punctuation?: string): string {
  return `${greeting}, ${name}${punctuation ?? '!'}`;
}
console.log(greet('Ann'));
console.log(greet('Bob', 'Hi'));
console.log(greet('Cy', undefined, '?'));

function sum(...nums: number[]): number {
  return nums.reduce((acc, n) => acc + n, 0);
}
console.log(sum(), sum(1), sum(1, 2, 3));
const values = [4, 5, 6];
console.log(sum(...values), Math.max(...values));

function tagged(first: string, ...rest: string[]) {
  return `${first}:${rest.length}:${rest.join('|')}`;
}
console.log(tagged('a'), tagged('a', 'b', 'c'));
