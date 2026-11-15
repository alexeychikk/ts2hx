import { DYNAMIC, FLOAT } from '@src/compiler/ir/builders';
import type { HxExpr } from '@src/compiler/ir/types';
import { containsYield } from '@src/compiler/passes/lower-generators';

import { compileSources } from './helpers';

async function compile(lines: string[]) {
  const { code, diagnostics } = await compileSources({
    'main.ts': lines.join('\n'),
  });
  return { hx: code['Main_2.hx'], diagnostics };
}

async function moduleOf(lines: string[]): Promise<string> {
  const { hx, diagnostics } = await compile(lines);
  expect(diagnostics).toEqual([]);
  return hx;
}

const yieldOne: HxExpr = {
  kind: 'yield',
  value: { kind: 'const', value: 1, type: FLOAT },
  delegate: false,
  type: DYNAMIC,
};

describe('generators', () => {
  it('finds yields outside nested functions only', () => {
    expect(containsYield({ kind: 'expr', expr: yieldOne })).toBe(true);
    expect(
      containsYield({
        kind: 'fn',
        fn: {
          typeParams: [],
          params: [],
          ret: DYNAMIC,
          body: [{ kind: 'expr', expr: yieldOne }],
        },
        type: DYNAMIC,
      }),
    ).toBe(false);
  });

  it('turns a generator body into a state machine with hoisted locals', async () => {
    const hx = await moduleOf([
      'function* count(n: number): Generator<number, string, number> {',
      '  let i = 0;',
      '  while (i < n) {',
      '    const step = yield i;',
      '    i += step;',
      '  }',
      "  return 'end';",
      '}',
      'console.log(count(3).next());',
    ]);
    expect(hx).toContain('function count(n:Float):ts2hx.Generator<Float> {');
    expect(hx).toMatch(/\tvar i:Float = 0\.0;\n\tvar step:Float = 0\.0;/);
    expect(hx).toMatch(
      /return new ts2hx\.Generator<Float>\(function\((__gen_\d+):ts2hx\.Generator\.GeneratorCore\):Dynamic \{\n\t\twhile \(true\) \{\n\t\t\tswitch \(\1\.state\) \{/,
    );
    expect(hx).toMatch(/return __gen_\d+\.yieldTo\(\d+, i\);/);
    expect(hx).toMatch(/__sent\d+ = __gen_\d+\.sent\(\);/);
    expect(hx).toMatch(/return __gen_\d+\.finish\("end"\);/);
    expect(hx).not.toContain('isReturn');
  });

  it('routes a throw to the catch state, letting return() through to finally only', async () => {
    const hx = await moduleOf([
      'function* guarded(): Generator<number> {',
      '  try {',
      '    yield 1;',
      '  } catch (e) {',
      "    console.log('caught');",
      '  }',
      '  try {',
      '    yield 2;',
      '  } finally {',
      "    console.log('cleanup');",
      '  }',
      '}',
      'console.log([...guarded()]);',
    ]);
    const router = hx.slice(hx.indexOf('} catch (__error'));
    expect(router).toMatch(
      /if \(!ts2hx\.Generator\.GeneratorCore\.isReturn\(__error\d+\)\) \{\n\t+__caught_\d+ = __error\d+;/,
    );
    expect(router.match(/isReturn/g)).toHaveLength(1);
    expect(router).toMatch(/\}\n\t+throw __error\d+;/);
  });

  it('keeps what JS evaluates before a nested yield in a temp', async () => {
    const hx = await moduleOf([
      'declare function first(): number;',
      'function* pair(): Generator<number, void, number> {',
      '  console.log(first(), yield 1);',
      '}',
      'pair().next();',
    ]);
    expect(hx).toMatch(
      /(__operand\d+) = ts2hx\.Console\.inspectNumber\(first\(\)\);\n\t+return (__gen_\d+)\.yieldTo\((\d+), 1\.0\);\n\t+\}\n\t+case \3: \{\n\t+(__sent\d+) = \2\.sent\(\);\n\t+ts2hx\.Console\.log\(\1, ts2hx\.Console\.inspectNumber\(\4\)\);/,
    );
  });

  it('reports a yield in a branch that may not run', async () => {
    const { hx, diagnostics } = await compile([
      'function* maybe(flag: boolean): Generator<number, void, number> {',
      '  console.log(flag && (yield 1));',
      '}',
      'maybe(true).next();',
    ]);
    expect(diagnostics.map((d) => d.message).join('\n')).toContain(
      'a yield inside this expression',
    );
    expect(hx).toContain('ts2hx.Ts2hx.unsupported(');
  });

  it('maps generator methods and [Symbol.iterator]() members', async () => {
    const hx = await moduleOf([
      'function* g(): Generator<number> { yield 1; }',
      'const it = g();',
      'console.log(it.return(2), it.throw(new Error("x")));',
      'class Bag {',
      '  *[Symbol.iterator](): Generator<string> { yield "a"; }',
      '}',
      'const bag = new Bag();',
      'console.log([...bag], bag[Symbol.iterator]().next());',
    ]);
    expect(hx).toContain('it.doReturn(2.0)');
    expect(hx).toMatch(/it\.doThrow\(new ts2hx\.Error/);
    expect(hx).toContain(
      'public function __ts2hx_iterator():ts2hx.Generator<String> {',
    );
    expect(hx).toContain('ts2hx.Iter.toArray(bag)');
    expect(hx).toContain('ts2hx.Iter.iterator(bag).next()');
  });

  it('runs for…of over an iterator with the protocol, closing it when left early', async () => {
    const hx = await moduleOf([
      'function* g(): Generator<number> { yield 1; }',
      'for (const x of g()) {',
      '  if (x > 0) break;',
      '}',
    ]);
    expect(hx).toMatch(
      /final (__iterator_\d+):Dynamic = ts2hx\.Iter\.iterator\(g\(\)\);/,
    );
    expect(hx).toMatch(
      /(__open_\d+) = false;\n\t+final (__step_\d+):Dynamic = ts2hx\.Iter\.step\(__iterator_\d+\);\n\t+if \(ts2hx\.Iter\.done\(\2\)\) \{\n\t+break;\n\t+\}\n\t+\1 = true;\n\t+var x:Float = \(cast \2\.value : Float\);/,
    );
    expect(hx).toMatch(
      /if \(__open_\d+\) \{\n\t+ts2hx\.Iter\.close\(__iterator_\d+\);/,
    );
  });
});
