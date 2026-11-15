function delay<T>(ms: number, value: T): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

async function* countdown(from: number): AsyncGenerator<number> {
  for (let i = from; i > 0; i--) {
    await delay(5, null);
    yield i;
  }
  return;
}

async function* withCleanup(): AsyncGenerator<string> {
  try {
    yield 'first';
    yield 'second';
    yield 'third';
  } finally {
    console.log('generator cleanup');
  }
}

async function* yieldsPromises(): AsyncGenerator<string> {
  yield delay(10, 'awaited yield');
  const sent = yield 'plain';
  console.log('sent', sent);
}

async function main(): Promise<void> {
  for await (const n of countdown(3)) {
    console.log('count', n);
  }
  for await (const s of withCleanup()) {
    console.log('got', s);
    if (s === 'second') break;
  }
  for await (const v of [delay(20, 'slow'), 'sync', delay(5, 'fast')]) {
    console.log('array item', v);
  }
  const gen = yieldsPromises();
  console.log(await gen.next());
  console.log(await gen.next());
  console.log(await gen.next('hello'));
  console.log(await gen.next());

  const early = withCleanup();
  console.log(await early.next());
  console.log(await early.return('stopped'));
  console.log(await early.next());

  const thrown = countdown(2);
  await thrown.next();
  try {
    await thrown.throw(new Error('boom'));
  } catch (e) {
    console.log('throw rejected', (e as Error).message);
  }
  console.log(await thrown.next());

  let total = 0;
  try {
    for await (const n of countdown(5)) {
      total += n;
      if (n === 3) throw new Error('stop at 3');
    }
  } catch (e) {
    console.log('loop error', (e as Error).message, total);
  }
}

main().then(() => console.log('done'));
