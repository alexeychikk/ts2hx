const date = /(\d{4})-(\d{2})-(\d{2})/;
const m = date.exec('due 2024-03-15!');
if (m) {
  console.log(m[0], m[1], m[2], m[3], m.index, m.input, m.length);
}
console.log(m);
console.log(date.exec('none') === null, date.test('1999-12-31'), date.test('x'));
console.log(date.source, date.flags, date.global, String(date));

const word = /\w+/g;
const text = 'one two  three';
let found: RegExpExecArray | null;
while ((found = word.exec(text)) !== null) {
  console.log(found[0], found.index, word.lastIndex);
}
console.log(word.lastIndex);

const sticky = /foo/y;
console.log(sticky.test('foofoo bar'), sticky.lastIndex);
console.log(sticky.test('foofoo bar'), sticky.lastIndex);
console.log(sticky.test('foofoo bar'), sticky.lastIndex);
sticky.lastIndex = 0;
console.log(sticky.exec('xfoo') === null, sticky.lastIndex);

const flags = new RegExp('^b.r$', 'gims');
console.log(flags.flags, flags.ignoreCase, flags.multiline, flags.dotAll);
console.log(flags.test('foo\nBAR\nbaz'), flags.lastIndex);
console.log(/a.c/.test('a\nc'), /a.c/s.test('a\nc'), /^end$/.test('end\n'));
console.log(/\bcat\b/.test('a cat!'), /\bcat\b/.test('concat'));
console.log(/\d+/.test('٣'), /\s/.test(' '), /[\d.]+/.exec('v1.25')?.[0]);
console.log(/(a)?b/.exec('b'), /(a)|(b)/.exec('b')?.length);
console.log(/(\w)\1/.exec('abccd')?.[0], /(a)?b\1/.test('b'));
console.log(/(?<=\$)\d+/.exec('cost $42')?.[0], /\d+(?!px)/.exec('12px 7em')?.[0]);
console.log(/[^]/.test('\n'), /[]/.test('a'), /A\x42/.test('AB'));
console.log(/Ä/i.test('ä'), /é+/.exec('caféé')?.index, /a\/b/.source);
const fromRe = new RegExp(/ab+c/i, 'g');
console.log(fromRe.flags, fromRe.source, RegExp('x*').source);
const empty = /a*/g;
console.log(empty.exec('bbb')?.index, empty.lastIndex);
