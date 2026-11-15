const re = /(?<year>\d{4})-(\d{2})-(?<day>\d{2})/;
const m = re.exec('on 2024-03-15');
if (m && m.groups) {
  console.log(m[1], m[2], m[3], m.groups.year, m.groups.day, m.index);
}
const opt = /(?<a>x)?(?<b>y)/.exec('y');
console.log(opt?.groups?.a, opt?.groups?.b, opt?.[1], opt?.[2]);
console.log(/(?<q>['"]).*?\k<q>/.exec(`say "hi" 'there'`)?.[0]);
console.log(/(\d)(?<x>\d)\2/.test('122'), /(\d)(?<x>\d)\2/.test('121'));
console.log('2024-03-15'.replace(/(?<y>\d+)-(\d+)-(?<d>\d+)/, '$3.$2.$1 $<y>'));
console.log(
  'k1=v1;k2=v2'.replace(
    /(?<key>\w+)=(?<value>\w+)/g,
    (_m: string, key: string, value: string) => `${value}=${key}`,
  ),
);
const iso = 'from 2023-01-02 to 2024-05-06';
for (const d of iso.matchAll(/(?<y>\d{4})-(?<mo>\d\d)-(?<dd>\d\d)/g)) {
  console.log(d.index, d[0], d[2], d.groups?.y, d.groups?.mo);
}
console.log(m?.groups);
