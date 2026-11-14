import { compileSources } from './helpers';

async function moduleOf(lines: string[]): Promise<string> {
  const { code, diagnostics } = await compileSources({
    'main.ts': lines.join('\n'),
  });
  expect(diagnostics).toEqual([]);
  return code['Main_2.hx'];
}

describe('stdlib: arrays', () => {
  it('binds Array.prototype methods to JsArray static calls', async () => {
    const hx = await moduleOf([
      'const xs: number[] = [3, 1, 2];',
      'console.log(xs.slice(1), xs.at(-1), xs.includes(2), xs.indexOf(9), xs.concat(4, [5]));',
      'console.log(xs.pop(), xs.splice(1), xs.splice(0, 1, 7, 8), xs.sort(), xs.flat());',
    ]);
    expect(hx).toContain('ts2hx.JsArray.slice(xs, 1.0)');
    expect(hx).toContain('ts2hx.JsArray.at(xs, -1.0)');
    expect(hx).toContain('ts2hx.JsArray.includes(xs, 2.0)');
    expect(hx).toContain('ts2hx.JsArray.concat(xs, [4.0], [5.0])');
    expect(hx).toContain('ts2hx.JsArray.pop(xs)');
    expect(hx).toContain(
      'ts2hx.JsArray.splice(xs, 1.0, Math.POSITIVE_INFINITY)',
    );
    expect(hx).toContain('ts2hx.JsArray.splice(xs, 0.0, 1.0, 7.0, 8.0)');
    expect(hx).toContain('ts2hx.JsArray.sort(xs)');
    expect(hx).toContain('ts2hx.JsArray.flat(xs)');
  });

  it('pads callback literals to (value, index, array)', async () => {
    const hx = await moduleOf([
      'const xs: number[] = [3, 1, 2];',
      'console.log(xs.filter((n) => n > 1), xs.reduce((a, b) => a + b));',
    ]);
    expect(hx).toMatch(
      /ts2hx\.JsArray\.filter\(xs, function\(n:Float, __unused_\d+:Float, __unused_\d+:Array<Float>\):Bool/,
    );
    expect(hx).toMatch(
      /ts2hx\.JsArray\.reduceFirst\(xs, function\(a:Float, b:Float, __unused_\d+:Float, __unused_\d+:Array<Float>\):Float/,
    );
  });

  it('wraps function references that take fewer parameters', async () => {
    const hx = await moduleOf([
      'function double(n: number): number { return n * 2; }',
      'const xs: number[] = [3, 1, 2];',
      'console.log(xs.map(double));',
    ]);
    expect(hx).toMatch(
      /ts2hx\.JsArray\.map\(xs, function\((__arg_\d+):Float, __unused_\d+:Float, __unused_\d+:Array<Float>\):Float \{\s*return double\(\1\);/,
    );
  });

  it('tests non-boolean predicate results for truthiness', async () => {
    const hx = await moduleOf([
      'const xs: number[] = [3, 1, 2];',
      'console.log(xs.filter((n) => n % 2), xs.some((n) => n > 1));',
    ]);
    expect(hx).toContain(
      'ts2hx.JsArray.filter(xs, ts2hx.JsArray.truthyCallback(',
    );
    expect(hx).not.toContain(
      'ts2hx.JsArray.some(xs, ts2hx.JsArray.truthyCallback(',
    );
  });

  it('spreads into push and binds length writes and the Array constructor', async () => {
    const hx = await moduleOf([
      'const xs: number[] = [];',
      'const ys: number[] = [1, 2];',
      'xs.push(...ys);',
      'xs.length = 1;',
      'const zs = new Array<string>(3);',
      'console.log(xs, zs, Array.of(1, 2), Array.from({ length: 2 }, (_, i) => i));',
    ]);
    expect(hx).toContain('ts2hx.JsArray.push(xs, ...ys)');
    expect(hx).toContain('ts2hx.JsArray.setLength(xs, 1.0)');
    expect(hx).toContain('ts2hx.JsArray.ofLength(3.0)');
    expect(hx).toContain('[1.0, 2.0]');
    expect(hx).toContain('ts2hx.JsArray.fromArrayLike(');
  });

  it('lowers compound and ++/-- writes to length through setLength', async () => {
    const hx = await moduleOf([
      'const xs: number[] = [1, 2, 3];',
      'const lists: number[][] = [[1, 2]];',
      'xs.length -= 1;',
      'const old = xs.length--;',
      '++xs.length;',
      'lists[0].length += 1;',
      'console.log(old, lists);',
    ]);
    expect(hx).not.toContain('ts2hx.Ts2hx.unsupported');
    expect(hx).toContain('ts2hx.JsArray.setLength(xs, xs.length - 1.0)');
    expect(hx).toMatch(
      /final (__length_\d+):Float = xs\.length;\s*ts2hx\.JsArray\.setLength\(xs, \1 - 1\.0\);\s*\1;/,
    );
    expect(hx).toContain('ts2hx.JsArray.setLength(xs, xs.length + 1.0)');
    expect(hx).toMatch(
      /ts2hx\.JsArray\.setLength\((__value_\d+), \1\.length \+ 1\.0\)/,
    );
  });

  it('types flat() from the checked result type', async () => {
    const hx = await moduleOf([
      'const rows: number[][] = [[1], [2]];',
      'const ys: number[] = rows.flat();',
      'console.log(ys);',
    ]);
    expect(hx).toMatch(/var ys:Array<Float>/);
    expect(hx).toContain('ys = ts2hx.JsArray.flat(rows)');
  });

  it('passes element arguments of a Dynamic-element array as Dynamic', async () => {
    const hx = await moduleOf([
      "const u = [1, 'a', null];",
      "console.log(u.includes('a'), u.indexOf(1, 1), u.fill('f', 2));",
      "u.push('b', 2);",
      "u.splice(0, 1, 'q');",
    ]);
    expect(hx).toContain('ts2hx.JsArray.includes(u, (cast "a" : Dynamic))');
    expect(hx).toContain('ts2hx.JsArray.indexOf(u, (cast 1.0 : Dynamic), 1.0)');
    expect(hx).toContain('ts2hx.JsArray.fill(u, (cast "f" : Dynamic), 2.0)');
    expect(hx).toContain(
      'ts2hx.JsArray.push(u, (cast "b" : Dynamic), (cast 2.0 : Dynamic))',
    );
    expect(hx).toContain(
      'ts2hx.JsArray.splice(u, 0.0, 1.0, (cast "q" : Dynamic))',
    );
  });

  it('fixes the type of an inline array literal receiver', async () => {
    const hx = await moduleOf([
      "console.log([1, 'a'].join('-'), [1, 2].indexOf(2));",
    ]);
    expect(hx).toContain(
      'ts2hx.JsArray.join((cast [(cast 1.0 : Dynamic), (cast "a" : Dynamic)] : Array<Dynamic>), "-")',
    );
    expect(hx).toContain(
      'ts2hx.JsArray.indexOf((cast [1.0, 2.0] : Array<Float>), 2.0)',
    );
  });

  it('reads iterator results of entries() dynamically', async () => {
    const hx = await moduleOf([
      'const xs: number[] = [1];',
      'console.log(xs.entries().next().value, xs.keys().next().done);',
    ]);
    expect(hx).toContain('ts2hx.JsArray.entries(xs).next().value');
    expect(hx).toContain('ts2hx.JsArray.keys(xs).next().done');
  });
});
