const s = 'héllo😀';
console.log(s.length);
console.log(s.charCodeAt(5), s.charCodeAt(6), s.codePointAt(5));
console.log(s.slice(0, 5), s.toUpperCase());
console.log([...s].length);
for (const ch of 'añ😀') {
  console.log(ch, ch.length);
}
console.log('ß'.toUpperCase(), String.fromCodePoint(128512));
console.log(s.codePointAt(6), s.at(-1)!.charCodeAt(0), s.slice(-2) === '😀');
console.log(s.indexOf('😀'), s.split('').length, s.charAt(5).charCodeAt(0));
console.log(
  'ÉCOLE'.toLowerCase(),
  'straße'.toUpperCase(),
  'ΟΔΟΣ'.toLowerCase(),
  'İ'.toLowerCase().length,
);
console.log(
  'naïve café'.toUpperCase(),
  'ΑΒΓ'.toLowerCase(),
  'привет'.toUpperCase(),
);
console.log(
  String.fromCodePoint(0x1f600, 0x41).length,
  String.fromCharCode(0xd83d, 0xde00),
);
const decomposed = 'é';
console.log(
  decomposed.normalize() === 'é',
  'é'.normalize('NFD').length,
  decomposed.normalize('NFC').length,
);
console.log(
  '😀😁'.codePointAt(2),
  '😀'.codePointAt(1),
  [...'a😀b'].length,
  'a😀b'.length,
);
console.log(
  '　 ü  '.trim(),
  'ü'.padStart(3, 'ö'),
  'añb'.split('ñ'),
  'x😀y'.replace('😀', '-'),
);
