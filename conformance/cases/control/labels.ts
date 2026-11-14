outer: for (let i = 0; i < 4; i++) {
  for (let j = 0; j < 4; j++) {
    if (j === 2) continue outer;
    if (i === 3) break outer;
    console.log(i, j);
  }
}

let found = -1;
search: {
  for (const v of [5, 8, 13, 21]) {
    if (v % 2 === 0) {
      found = v;
      break search;
    }
  }
  found = 0;
}
console.log('found', found);

let total = 0;
outer2: while (true) {
  let k = 0;
  while (true) {
    k++;
    total += k;
    if (k === 3) break outer2;
  }
}
console.log('total', total);

let iters = 0;
loop: do {
  iters++;
  switch (iters) {
    case 1:
      continue loop;
    case 3:
      break loop;
  }
  console.log('do', iters);
} while (iters < 10);
console.log('iters', iters);

block: {
  console.log('in block');
  if (total > 0) break block;
  console.log('not reached');
}

a: b: for (let i = 0; i < 3; i++) {
  for (const j of [0, 1, 2]) {
    if (j > i) continue b;
    if (i === 2 && j === 1) break a;
    console.log('ab', i, j);
  }
}

sw: switch (iters) {
  case 3:
    for (let i = 0; i < 5; i++) {
      if (i === 2) break sw;
      console.log('sw', i);
    }
    console.log('not reached');
}

function find(grid: number[][], target: number): string {
  let found = 'none';
  let r = 0;
  rows: for (const row of grid) {
    let c = 0;
    for (const cell of row) {
      if (cell < 0) {
        r++;
        continue rows;
      }
      if (cell === target) {
        found = r + ',' + c;
        break rows;
      }
      c++;
    }
    r++;
  }
  return found;
}
console.log(
  find(
    [
      [1, 2],
      [-1, 9],
      [3, 9],
    ],
    9,
  ),
  find([[1]], 5),
);

const fns: Array<() => number> = [];
outer3: for (let i = 0; i < 4; i++) {
  fns.push(() => i);
  for (;;) {
    if (i % 2 === 0) continue outer3;
    break;
  }
  fns.push(() => i * 100);
}
console.log(fns.map((f) => f()).join(','));
