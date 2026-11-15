const s = 'a1b22c333';
console.log(s.match(/\d+/), s.match(/\d+/g), s.match(/z/g) === null, s.match(/z/) === null);
const first = s.match(/(\d)(\d)/);
console.log(first?.[0], first?.index, first?.input);
for (const m of s.matchAll(/[a-z](\d+)/g)) {
  console.log(m[0], m[1], m.index);
}
const all = [...'x=1, y=2'.matchAll(/(\w)=(\d)/g)].map((m) => m[1] + m[2]);
console.log(all, Array.from('aXbX'.matchAll(/X/g)).length);
console.log('a, b,c ,d'.split(/\s*,\s*/), 'abc'.split(/(?:)/), 'a1b2c3'.split(/\d/));
console.log('a1b2c3'.split(/(\d)/), 'a1b2c3'.split(/\d/, 2), ''.split(/x/), ''.split(/x*/));
console.log('one  two   three'.split(/\s+/), 'ab'.split(/(a)|(b)/));
console.log(s.search(/\d/), s.search(/z/), 'Hello'.search(/l+/));
console.log('aaa'.match(/a*?/g), 'test'.match('e.')?.[0], 'x.y'.search('.'));
try {
  'ab'.matchAll(/a/);
} catch (e) {
  console.log(e instanceof TypeError);
}
