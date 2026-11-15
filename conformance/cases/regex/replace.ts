const s = 'The quick brown fox jumps over the lazy dog';
console.log(s.replace(/o/, '0'), s.replace(/o/g, '0'));
console.log(s.replace(/the/gi, 'a'), s.replaceAll(/e/g, 'E'));
console.log(s.replace(/(\w+) (\w+)/, '$2 $1'), 'aaa'.replace(/a/g, '$&$&'));
console.log('x-y'.replace(/-/, "[$`|$']"), 'cost'.replace(/c/, '$$'), 'ab'.replace(/(a)/, '$2$1$0'));
console.log('2024-03-15'.replace(/(?<y>\d+)-(?<m>\d+)-(?<d>\d+)/, '$<d>/$<m>/$<y>'));
console.log('abc'.replace(/(?:)/g, '-'), 'abc'.replace(/x*/g, '_'));
console.log(s.replace(/\b\w/g, (c) => c.toUpperCase()));
console.log(
  'a1b22c333'.replace(/\d+/g, (match: string, offset: number) => `[${match}@${offset}]`),
);
console.log(
  'John Smith'.replace(/(\w+)\s(\w+)/, (_: string, first: string, last: string) => `${last}, ${first}`),
);
const upper = (m: string): string => m.toUpperCase();
console.log('hello world'.replace(/o/g, upper));
console.log('a.b.c'.replace(/\./g, '\\'), 'tab\there'.replace(/\t/, ' '));
console.log('line1\r\nline2\nline3'.replace(/\r?\n/g, '|'));
console.log('price: 10 USD'.replace(/(\d+)/, (m: string) => String(Number(m) * 2)));
const re = /o/g;
re.lastIndex = 5;
console.log('foo boo'.replace(re, 'X'), re.lastIndex);
console.log('aaa'.replace(/a/y, 'b'), 'baa'.replace(/a/y, 'b'));
try {
  'abc'.replaceAll(/b/, 'x');
} catch (e) {
  console.log(e instanceof TypeError);
}
