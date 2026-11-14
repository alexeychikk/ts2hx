const s = 'héllo😀';
console.log(s.length);
console.log(s.charCodeAt(5), s.charCodeAt(6), s.codePointAt(5));
console.log(s.slice(0, 5), s.toUpperCase());
console.log([...s].length);
for (const ch of 'añ😀') {
  console.log(ch, ch.length);
}
console.log('ß'.toUpperCase(), String.fromCodePoint(128512));
