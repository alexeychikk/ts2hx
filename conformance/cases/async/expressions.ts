function tick<T>(value: T): Promise<T> {
  return Promise.resolve(value);
}

let calls = 0;
async function counted<T>(value: T): Promise<T> {
  calls++;
  return value;
}

async function logical(flag: boolean, name: string | null): Promise<void> {
  const both = flag && (await counted(true));
  const either = flag || (await counted(false));
  const named = name ?? (await counted('anonymous'));
  const label = flag ? await counted('yes') : await counted('no');
  console.log(both, either, named, label, calls);
  if (flag && (await counted(1)) > 0) {
    console.log('guarded');
  }
}

async function composite(): Promise<void> {
  const point = { x: await tick(1), y: await tick(2) };
  const list = [await tick('a'), 'b', await tick('c')];
  console.log(point, list, `sum ${(await tick(3)) + (await tick(4))}`);
  console.log(Math.max(await tick(5), 9, await tick(7)));
}

class Greeter {
  constructor(private readonly name: string) {}

  async greet(times: number): Promise<string[]> {
    const make = async (i: number) => `${this.name} #${await tick(i)}`;
    const out: string[] = [];
    for (let i = 1; i <= times; i++) {
      out.push(await make(i));
    }
    return out;
  }
}

async function main(): Promise<void> {
  await logical(true, 'bob');
  await logical(false, null);
  await composite();
  console.log(await new Greeter('hi').greet(2));
  const fns = [async () => 1, async () => 2];
  let total = 0;
  for (const fn of fns) total += await fn();
  console.log('total', total);
}

main();
