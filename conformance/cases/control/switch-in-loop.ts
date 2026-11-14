for (let i = 0; i < 6; i++) {
  switch (i % 3) {
    case 0:
      if (i > 2) break;
      console.log('zero', i);
      break;
    case 1:
      continue;
    default:
      console.log('other', i);
  }
  console.log('after', i);
}

let n = 0;
while (n < 10) {
  n++;
  switch (n) {
    case 3:
      console.log('three');
      continue;
    case 5:
      console.log('five, stop');
      break;
    case 7:
      console.log('seven, leave loop');
  }
  if (n === 7) break;
  console.log('n', n);
}

const words = ['a', 'bb', 'ccc', 'stop', 'dddd'];
for (const w of words) {
  let done = false;
  switch (w.length) {
    case 1:
    case 2:
      console.log('short', w);
      break;
    default:
      if (w === 'stop') {
        done = true;
        break;
      }
      console.log('long', w);
  }
  if (done) break;
}

let k = 0;
do {
  k++;
  switch (k) {
    case 2:
      for (let j = 0; j < 3; j++) {
        if (j === 1) break;
        console.log('inner', k, j);
      }
      continue;
    case 4:
      break;
  }
  console.log('k', k);
} while (k < 5);

function nonConstant(x: number, a: number, b: number): string {
  let calls = 0;
  const probe = (v: number) => {
    calls++;
    return v;
  };
  switch (x) {
    case probe(a):
      return 'a after ' + calls;
    case probe(b):
      return 'b after ' + calls;
    case probe(a + b):
      return 'sum after ' + calls;
  }
  return 'none after ' + calls;
}
console.log(nonConstant(1, 1, 2));
console.log(nonConstant(2, 1, 2));
console.log(nonConstant(3, 1, 2));
console.log(nonConstant(9, 1, 2));

function middleDefault(s: string): string {
  const out: string[] = [];
  switch (s) {
    case 'x':
      out.push('x');
      break;
    default:
      out.push('default');
    case 'y':
      out.push('y');
      break;
    case 'z':
      out.push('z');
  }
  return out.join('+');
}
for (const s of ['x', 'y', 'z', 'w']) console.log(s, middleDefault(s));

function onlyDefault(v: number): number {
  switch (v) {
    default:
      return v * 2;
  }
}
console.log(onlyDefault(21));

function grade(score: number): string {
  switch (true) {
    case score >= 90:
      return 'A';
    case score >= 80:
      return 'B';
    default:
      return 'C';
  }
}
console.log(grade(95), grade(85), grade(10));

function fallReturn(n: number): string {
  switch (n) {
    case 1:
      n += 10;
    case 2:
      return 'low ' + n;
    default:
      return 'high ' + n;
  }
}
console.log(fallReturn(1), fallReturn(2), fallReturn(3));

function search(limit: number): number {
  let i = 0;
  outer: while (true) {
    i++;
    for (let j = 0; j < 3; j++) {
      if (i * j > limit) return i * 10 + j;
      if (j === i) continue outer;
    }
  }
}
console.log(search(4));

for (const v of [1, 2]) {
  switch (v) {
    case 1: {
      const f = (): string => {
        for (;;) {
          break;
        }
        switch (v) {
          case 1:
            return 'inner one';
        }
        return 'inner other';
      };
      console.log(f());
      break;
    }
    default: {
      const twice = v * 2;
      console.log('d', twice);
    }
  }
}

let calls = 0;
const next = (): number => ++calls;
switch (next()) {
  case 0:
    console.log('never');
    break;
  case 1:
    console.log('subject read once', calls);
}

switch (calls) {
}
console.log('empty switch done');
