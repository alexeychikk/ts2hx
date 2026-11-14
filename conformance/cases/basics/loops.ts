let out = '';
for (let i = 0; i < 10; i++) {
  if (i % 3 === 0) continue;
  if (i === 8) break;
  out += i;
}
console.log(out);

let n = 0;
while (n < 5) {
  n += 2;
}
console.log(n);

let m = 10;
do {
  m--;
} while (m > 20);
console.log(m);

for (let i = 0, j = 10; i < j; i += 3, j -= 2) {
  console.log(i, j);
}

const words = ['alpha', 'beta', 'gamma'];
for (const w of words) {
  console.log(w.toUpperCase());
}
