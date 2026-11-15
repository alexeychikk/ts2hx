import { DYNAMIC, FLOAT } from '@src/compiler/ir/builders';
import { containsYield } from '@src/compiler/passes/lower-generators';

import { compileSources } from './helpers';

async function moduleOf(lines: string[]): Promise<string> {
  const { code, diagnostics } = await compileSources({
    'main.ts': lines.join('\n'),
  });
  expect(diagnostics).toEqual([]);
  return code['Main_2.hx'];
}

describe('async/await', () => {
  it('treats an await as a resume point', () => {
    expect(
      containsYield({
        kind: 'expr',
        expr: {
          kind: 'await',
          value: { kind: 'const', value: 1, type: FLOAT },
          type: DYNAMIC,
        },
      }),
    ).toBe(true);
  });

  it('runs an async function body as a state machine driven by Async.run', async () => {
    const hx = await moduleOf([
      'async function twice(n: number): Promise<number> {',
      '  const value = await Promise.resolve(n);',
      '  return value * 2;',
      '}',
      'twice(2).then((v) => console.log(v));',
    ]);
    expect(hx).toContain('function twice(n:Float):ts2hx.Promise<Float> {');
    expect(hx).toMatch(/\tvar value:Float = 0\.0;/);
    expect(hx).toMatch(
      /return ts2hx\.Async\.run\(function\((__gen_\d+):ts2hx\.Generator\.GeneratorCore\):Dynamic \{/,
    );
    expect(hx).toMatch(/return __gen_\d+\.awaitTo\(1, /);
    expect(hx).toMatch(/return __gen_\d+\.finish\(value \* 2\.0\);/);
  });

  it('compiles async arrows and methods', async () => {
    const hx = await moduleOf([
      'class Box {',
      '  value = 1;',
      '  async get(): Promise<number> {',
      '    return await Promise.resolve(this.value);',
      '  }',
      '}',
      'const add = async (a: number) => (await new Box().get()) + a;',
      'add(1).then((v) => console.log(v));',
    ]);
    expect(hx.match(/ts2hx\.Async\.run\(/g)).toHaveLength(2);
    expect(hx).toContain('this.value');
  });

  it('builds an async generator whose yields and returns await', async () => {
    const hx = await moduleOf([
      'async function* numbers(): AsyncGenerator<number, string> {',
      '  yield 1;',
      "  return 'end';",
      '}',
      'numbers().next().then((r) => console.log(r));',
    ]);
    expect(hx).toContain(
      'function numbers():ts2hx.Async.AsyncGenerator<Float> {',
    );
    expect(hx).toMatch(/return new ts2hx\.Async\.AsyncGenerator<Float>\(/);
    expect(hx).toMatch(/awaitTo\(1, 1\.0\)/);
    expect(hx).toMatch(/yieldTo\(\d+, __sent\d+\)/);
    expect(hx).toMatch(/awaitTo\(\d+, "end"\)/);
  });

  it('runs for await over the async iteration protocol', async () => {
    const hx = await moduleOf([
      'async function main(): Promise<void> {',
      '  for await (const x of [Promise.resolve(1), 2]) {',
      '    console.log(x);',
      '  }',
      '}',
      'main();',
    ]);
    expect(hx).toContain('ts2hx.Async.iterator(');
    expect(hx).toMatch(/awaitTo\(\d+, ts2hx\.Async\.step\(__iterator_?\d+\)\)/);
    expect(hx).toMatch(/ts2hx\.Async\.close\(__iterator_?\d+\)/);
  });

  it('runs a module with top-level await as an async body', async () => {
    const hx = await moduleOf([
      'const value = await Promise.resolve(3);',
      'console.log(value);',
    ]);
    expect(hx).toMatch(/ts2hx\.Async\.run\(function\(__gen\d+/);
    expect(hx).toMatch(/awaitTo\(1, /);
  });

  it('reports yield* in an async generator', async () => {
    const { diagnostics } = await compileSources({
      'main.ts': [
        'async function* inner(): AsyncGenerator<number> { yield 1; }',
        'async function* outer(): AsyncGenerator<number> { yield* inner(); }',
        'outer();',
      ].join('\n'),
    });
    expect(diagnostics.map((d) => d.message).join('\n')).toContain(
      'yield* in async generators',
    );
  });
});
