function classify(n: number): string {
  const parts: string[] = [];
  switch (n) {
    case 0:
      parts.push('zero');
    case 1:
      parts.push('small');
      break;
    case 2:
    case 3:
      parts.push('medium');
      break;
    default:
      parts.push('large');
    case 10:
      parts.push('ten-ish');
  }
  return parts.join(',');
}
for (const n of [0, 1, 2, 3, 7, 10]) {
  console.log(n, classify(n));
}

const label: string = 'b';
switch (label) {
  case 'a':
    console.log('is a');
    break;
  case 'b':
    console.log('is b');
    break;
}

for (let i = 0; i < 4; i++) {
  switch (i) {
    case 1:
      continue;
    case 2:
      break;
    default:
      console.log('loop', i);
  }
  console.log('after switch', i);
}
