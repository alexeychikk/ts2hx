function delay<T>(ms: number, value: T): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

async function fail(message: string): Promise<number> {
  await delay(1, 0);
  throw new Error(message);
}

async function withFinally(n: number): Promise<string> {
  try {
    console.log('try', n);
    if (n > 1) await fail('too big');
    await delay(1, n);
    return `ok ${n}`;
  } catch (e) {
    console.log('catch', (e as Error).message);
    await delay(1, 0);
    return `recovered ${n}`;
  } finally {
    console.log('finally', n);
    await delay(1, 0);
    console.log('finally done', n);
  }
}

async function nested(): Promise<number> {
  let steps = 0;
  try {
    try {
      steps++;
      await fail('inner');
    } finally {
      steps += 10;
      console.log('inner finally', steps);
    }
  } catch (e) {
    steps += 100;
    console.log('outer catch', (e as Error).message, steps);
  }
  return steps;
}

async function rethrow(): Promise<void> {
  try {
    await fail('first');
  } catch (e) {
    throw new Error(`wrapped ${(e as Error).message}`);
  } finally {
    console.log('rethrow finally');
  }
}

async function finallyOverrides(): Promise<string> {
  try {
    return await delay(1, 'from try');
  } finally {
    console.log('cleanup before return');
  }
}

async function rejectedAwait(): Promise<string> {
  try {
    await Promise.reject(new Error('rejected value'));
    return 'unreachable';
  } catch (e) {
    return `caught ${(e as Error).message}`;
  }
}

async function main(): Promise<void> {
  console.log(await withFinally(1));
  console.log(await withFinally(2));
  console.log(await nested());
  try {
    await rethrow();
  } catch (e) {
    console.log('main caught', (e as Error).message);
  }
  console.log(await finallyOverrides());
  console.log(await rejectedAwait());
  await fail('unhandled by await').catch((e: Error) =>
    console.log('promise catch', e.message),
  );
}

main().then(() => console.log('done'));
