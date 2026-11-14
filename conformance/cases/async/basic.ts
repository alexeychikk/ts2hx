function delay(ms: number, value: string): Promise<string> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

async function fetchNumber(n: number): Promise<number> {
  await null;
  if (n < 0) throw new Error(`bad ${n}`);
  return n * 2;
}

async function main(): Promise<void> {
  console.log('start');
  console.log(await fetchNumber(21));
  try {
    await fetchNumber(-1);
  } catch (e) {
    console.log('caught', (e as Error).message);
  }
  const results = await Promise.all([
    delay(20, 'slow'),
    delay(5, 'fast'),
    fetchNumber(1),
  ]);
  console.log(results);
  let total = 0;
  for (const n of [1, 2, 3]) {
    total += await fetchNumber(n);
  }
  console.log('total', total);
  console.log(await Promise.race([delay(30, 'late'), delay(10, 'early')]));
}

main().then(() => console.log('done'));
console.log('sync end');
