const s = 'Hello, World';
console.log(
  s.length,
  s.charAt(4),
  s.charCodeAt(0),
  s.indexOf('o'),
  s.lastIndexOf('o'),
);
console.log(s.slice(-5), s.slice(2, -3), s.substring(5, 2), s.substr(7, 3));
console.log(s.toUpperCase(), s.toLowerCase());
console.log(s.split(', '), 'a,b,,c'.split(','), 'abc'.split(''));
console.log(s.replace('o', '0'), s.replaceAll('o', '0'));
console.log(s.includes('World'), s.startsWith('Hell'), s.endsWith('d'));
console.log(
  '  pad  '.trim() + '|',
  '  pad  '.trimStart() + '|',
  '  pad  '.trimEnd() + '|',
);
console.log('5'.padStart(3, '0'), '5'.padEnd(3, '*'), 'ab'.repeat(3));
console.log(s.at(-1), 'abc'.concat('def', 'g'), String.fromCharCode(72, 105));
console.log(['x', 'y', 'z'].join('-'), 'a-b-c'.split('-', 2));
console.log(s.charAt(99) === '', s.charCodeAt(99), s.at(99), s.codePointAt(99));
console.log(
  s.indexOf('o', 5),
  s.lastIndexOf('o', 5),
  s.indexOf(''),
  s.lastIndexOf(''),
);
console.log(
  s.indexOf('', 99),
  s.includes('o', 9),
  s.startsWith('World', 7),
  s.endsWith('Hello', 5),
);
console.log(
  s.slice(),
  s.slice(-3, -1),
  s.slice(5, 2),
  s.substring(-2, 3),
  s.substr(-5),
);
console.log(s.substr(2), s.substring(4), s.slice(NaN, 3));
console.log(
  'a-b-c'.split('-', 0),
  ''.split(','),
  ''.split(''),
  'abc'.split('', 2),
);
console.log(
  'aXbXc'.replace('X', '[$&]'),
  'aXbXc'.replaceAll('X', '$$'),
  'abc'.replace('b', "$`$'"),
);
console.log(
  'aaa'.replaceAll('', '-'),
  'abc'.replace('', '^'),
  'x.y.z'.replaceAll('.', '/'),
);
console.log(
  'abcb'.replace('b', (m) => m.toUpperCase()),
  'abcb'.replaceAll('b', (m, offset) => `${m}${offset}`),
);
console.log(
  ' \t x \n﻿'.trim() + '|',
  'ab'.padStart(7, 'xyz'),
  'ab'.padEnd(1),
  'ab'.padEnd(4),
);
console.log(
  'ab'.padStart(5, ''),
  '-'.repeat(0) === '',
  'abc'.at(0),
  'abc'.at(-4),
);
console.log(s[0], s[11], s[12], 'abc'.toString(), 'abc'.valueOf());
console.log(
  'Abc'.localeCompare('abc') !== 0,
  'a'.localeCompare('b'),
  'b'.localeCompare('a'),
  'a'.localeCompare('a'),
);
console.log(
  String.raw`a\nb${1 + 1}\t${'x'}`,
  String.fromCharCode(0x41, 0x10041),
);
const word: string = 'tick';
let count = 0;
for (const c of word) {
  count += c.charCodeAt(0);
}
console.log(count, [...word].join('|'), [...'ab', 'c', ...['d']]);
