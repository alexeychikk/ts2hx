console.log('setup runs first');

let depth = 0;
for (let i = 0; i < 3; i++) {
  depth += i;
}
if (depth > 2) {
  console.log('setup depth', depth);
}
