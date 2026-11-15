import { constExpr, FLOAT, INT } from '@src/compiler/ir/builders';
import type { HxExpr } from '@src/compiler/ir/types';
import { intRange } from '@src/compiler/passes/infer-int';

import { compileSources } from './helpers';

async function functionOf(lines: string[]): Promise<string> {
  const { code, diagnostics } = await compileSources({
    'main.ts': lines.join('\n'),
  });
  expect(diagnostics).toEqual([]);
  return code['Main_2.hx'];
}

const local = (name: string): HxExpr => ({ kind: 'local', name, type: FLOAT });
const binop = (
  op: '+' | '-' | '*' | '%' | '/',
  left: HxExpr,
  right: HxExpr,
): HxExpr => ({ kind: 'binop', op, left, right, type: FLOAT });

describe('inferInt: ranges', () => {
  const env = new Map([
    ['i', { lo: 0, hi: 99 }],
    ['d', { lo: -5, hi: 5 }],
  ]);

  it('combines integral constants, demoted locals and lengths', () => {
    const length: HxExpr = {
      kind: 'field',
      target: local('xs'),
      name: 'length',
      type: INT,
    };
    expect(intRange(binop('+', local('i'), constExpr(1)), env)).toEqual({
      lo: 1,
      hi: 100,
    });
    expect(intRange(binop('-', length, local('i')), env)).toEqual({
      lo: -99,
      hi: 0x7fffffff,
    });
    expect(intRange(binop('%', local('i'), constExpr(7)), env)).toEqual({
      lo: 0,
      hi: 6,
    });
  });

  it('rejects what may be fractional, -0 or beyond 32 bits', () => {
    expect(intRange(constExpr(0.5), env)).toBeUndefined();
    expect(intRange(constExpr(-0), env)).toBeUndefined();
    expect(intRange(binop('/', local('i'), constExpr(2)), env)).toBeUndefined();
    expect(intRange(binop('*', local('d'), constExpr(3)), env)).toBeUndefined();
    expect(intRange(binop('%', local('d'), constExpr(3)), env)).toBeUndefined();
    expect(intRange(local('n'), env)).toBeUndefined();
    expect(
      intRange(binop('+', constExpr(0x7fffffff), local('i')), env),
    ).toBeUndefined();
  });
});

describe('inferInt: loop counters and indices', () => {
  it('demotes counters bounded by a length and drops their index conversions', async () => {
    const hx = await functionOf([
      'export function sum(xs: number[]): number {',
      '  let total = 0;',
      '  for (let i = 0; i < xs.length; i++) {',
      '    total += xs[i] * i;',
      '  }',
      '  return total;',
      '}',
    ]);
    expect(hx).toContain('var i:Int = 0;');
    expect(hx).toContain('while (i < xs.length) {');
    expect(hx).toContain('total += xs[i] * (i : Float);');
    expect(hx).not.toContain('Std.int');
  });

  it('proves nested index arithmetic over a const bound', async () => {
    const hx = await functionOf([
      'export function diag(cells: number[]): number {',
      '  const n = 8;',
      '  let total = 0;',
      '  for (let r = 0; r < n; r++) {',
      '    for (let c = r + 1; c < n; c++) {',
      '      total += cells[r * n + c];',
      '    }',
      '  }',
      '  return total;',
      '}',
    ]);
    expect(hx).toContain('final n:Int = 8;');
    expect(hx).toContain('var c:Int = r + 1;');
    expect(hx).toContain('total += cells[r * n + c];');
  });

  it('demotes falling counters and paired counters', async () => {
    const hx = await functionOf([
      'export function reverse(xs: number[]): void {',
      '  for (let lo = 0, hi = xs.length - 1; lo < hi; lo++, hi--) {',
      '    const t = xs[lo];',
      '    xs[lo] = xs[hi];',
      '    xs[hi] = t;',
      '  }',
      '  for (let i = xs.length; i > 0; i -= 2) {',
      '    xs[i - 1] = 0;',
      '  }',
      '}',
    ]);
    expect(hx).toContain('var lo:Int = 0;');
    expect(hx).toContain('var hi:Int = xs.length - 1;');
    expect(hx).toContain('var i:Int = xs.length;');
    expect(hx).toContain('xs[i - 1] = 0.0;');
    expect(hx).toContain('i -= 2;');
  });

  it('never reads a Float sibling in an Int init', async () => {
    const hx = await functionOf([
      'export function f(xs: number[]): number {',
      '  let total = 0;',
      '  for (let i = 0, j = i + 1; i < xs.length; i += 0.5) total += j;',
      '  return total;',
      '}',
    ]);
    expect(hx).toContain('var i:Float = 0.0;');
    expect(hx).toContain('var j:Float = i + 1.0;');
  });

  it('keeps Float for counters it cannot bound or prove integral', async () => {
    const hx = await functionOf([
      'export function f(n: number, xs: number[]): number[] {',
      '  const out: number[] = [];',
      '  for (let i = 0; i < n; i++) out.push(xs[i]);',
      '  for (let x = 0; x < 2; x += 0.5) out.push(x);',
      '  for (let x = 8; x > 1; x = x / 2) out.push(x);',
      '  for (let i = 2147483640; i < 2147483650; i++) out.push(i);',
      '  for (let i = 0; i < xs.length; i += 2) out.push(xs[i]);',
      '  for (let i = 0; i < 3; i++) out.push(i++);',
      '  for (let i = 0; i < 3; i++) setTimeout(() => out.push(i), 0);',
      '  let k = 0;',
      '  for (; k < 3; k++) out.push(k);',
      '  for (var v = 0; v < 3; v++) out.push(v);',
      '  return out;',
      '}',
    ]);
    expect(hx).not.toMatch(/:Int/);
  });

  it('widens reads outside comparisons and indices back to Float', async () => {
    const hx = await functionOf([
      'export function f(xs: number[]): unknown[] {',
      '  const out: unknown[] = [];',
      '  for (let i = 0; i < xs.length; i++) {',
      '    out.push(i, [i, i * i], `${i}`, i / 2, -i, xs[i * i]);',
      '  }',
      '  return out;',
      '}',
    ]);
    expect(hx).toContain('var i:Int = 0;');
    expect(hx).toContain('[(i : Float), (i : Float) * (i : Float)]');
    expect(hx).toContain('(i : Float) / 2.0');
    expect(hx).toContain('-(i : Float)');
    expect(hx).toContain('xs[Std.int((i : Float) * (i : Float))]');
  });

  it('respects shadowing by parameters of nested functions', async () => {
    const hx = await functionOf([
      'export function f(xs: number[]): string[] {',
      '  const out: string[] = [];',
      '  for (let i = 0; i < xs.length; i++) {',
      '    const half = (i: number) => i / 2;',
      '    out.push(String(half(xs[i])));',
      '  }',
      '  return out;',
      '}',
    ]);
    expect(hx).toContain('var i:Int = 0;');
    expect(hx).toMatch(/function\(i:Float\):Float \{\s*return i \/ 2\.0;/);
  });

  it('leaves consts that never index or bound a loop as Float', async () => {
    const hx = await functionOf([
      'export function f(x: number): number {',
      '  const base = 10;',
      '  return base + x;',
      '}',
    ]);
    expect(hx).toContain('final base:Float = 10.0;');
  });
});
