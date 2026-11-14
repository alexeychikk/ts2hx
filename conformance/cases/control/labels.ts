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
