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
