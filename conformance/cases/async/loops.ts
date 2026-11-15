function tick<T>(value: T): Promise<T> {
  return Promise.resolve(value);
}

async function sumWhile(limit: number): Promise<number> {
  let i = 0;
  let sum = 0;
  while (i < limit) {
    sum += await tick(i);
    i++;
  }
  return sum;
}

async function forLoop(): Promise<string[]> {
  const out: string[] = [];
  for (let i = 0; i < 5; i++) {
    if (i === 1) continue;
    if (i === 4) break;
    out.push(await tick(`item${i}`));
  }
  return out;
}

async function doWhile(): Promise<number> {
  let n = 0;
  do {
    n = await tick(n + 3);
  } while (n < 10);
  return n;
}

async function forOfLabels(): Promise<string> {
  const words = ['a', 'b', 'c'];
  let text = '';
  for (const w of words) {
    for (const x of [1, 2]) {
      text += w + (await tick(x));
      if (w === 'b') break;
    }
  }
  return text;
}

async function switchAwait(kind: number): Promise<string> {
  switch (await tick(kind)) {
    case 1:
      return 'one';
    case 2: {
      const v = await tick('two');
      return v.toUpperCase();
    }
    default:
      return 'other';
  }
}

async function sequential(): Promise<void> {
  const order: number[] = [];
  const work = async (n: number, ms: number) => {
    await new Promise<void>((r) => setTimeout(() => r(), ms));
    order.push(n);
    return n * n;
  };
  for (const [n, ms] of [
    [1, 30],
    [2, 10],
    [3, 20],
  ]) {
    console.log('square', await work(n, ms));
  }
  console.log('order', order);
  const parallel = await Promise.all([work(4, 30), work(5, 10)]);
  console.log('parallel', parallel, order);
}

class Counter {
  count = 0;
  async add(n: number): Promise<number> {
    for (let i = 0; i < n; i++) {
      this.count += await tick(1);
    }
    return this.count;
  }
  static async create(start: number): Promise<Counter> {
    const c = new Counter();
    c.count = await tick(start);
    return c;
  }
}

async function main(): Promise<void> {
  console.log(await sumWhile(5));
  console.log(await forLoop());
  console.log(await doWhile());
  console.log(await forOfLabels());
  console.log(await switchAwait(1), await switchAwait(2), await switchAwait(3));
  await sequential();
  const counter = await Counter.create(10);
  console.log(await counter.add(3));
  const values = await Promise.all(
    [1, 2, 3].map(async (x) => (await tick(x)) * 10),
  );
  console.log(values);
}

main();
