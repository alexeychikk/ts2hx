function* answers(flag: boolean): Generator<string, string, number> {
  const both = flag && (yield 'and') > 0;
  const either = flag || (yield 'or') > 0;
  const picked = flag ? yield 'then' : yield 'else';
  let missing: number | undefined;
  missing ??= yield 'nullish';
  return `${both} ${either} ${picked} ${missing}`;
}

for (const flag of [true, false]) {
  const gen = answers(flag);
  let step = gen.next();
  let sent = 1;
  while (!step.done) {
    console.log('yielded', step.value);
    step = gen.next(sent++);
  }
  console.log('returned', step.value);
}
