import { compileSources } from './helpers';

async function moduleOf(source: string): Promise<string> {
  const { code, diagnostics } = await compileSources({ 'main.ts': source });
  expect(diagnostics).toEqual([]);
  return code['Main_2.hx'];
}

describe('frontend: expressions, statements and functions', () => {
  it('computes ** through Num.pow and bitwise operators on int32', async () => {
    const hx = await moduleOf(
      'const a = 7;\nconst b = 3;\nconsole.log(a ** b, a & b, ~a, a >>> b, a << b);',
    );
    expect(hx).toContain('ts2hx.Num.pow(a, b)');
    expect(hx).toContain('ts2hx.Num.toInt32(a) & ts2hx.Num.toInt32(b)');
    expect(hx).toContain('~ts2hx.Num.toInt32(a)');
    expect(hx).toContain('ts2hx.Num.ushr(a, b)');
    expect(hx).toContain('ts2hx.Num.shl(a, b)');
  });

  it('lowers operators with an any operand to runtime conversions', async () => {
    const operations: [string, string][] = [
      ['x + n', 'Dynamic = ts2hx.Ts2hx.add(x, n)'],
      ['n + x', 'Dynamic = ts2hx.Ts2hx.add(n, x)'],
      [
        't + x',
        'String = ts2hx.Ts2hx.stringOperand(t) + ts2hx.Ts2hx.string(x)',
      ],
      ['x - y', 'Float = ts2hx.Ts2hx.toNumber(x) - ts2hx.Ts2hx.toNumber(y)'],
      ['10 * x', 'Float = 10.0 * ts2hx.Ts2hx.toNumber(x)'],
      ['x ** 2', 'Float = ts2hx.Num.pow(ts2hx.Ts2hx.toNumber(x), 2.0)'],
      [
        'x | 1',
        'Float = ts2hx.Num.toInt32(ts2hx.Ts2hx.toNumber(x)) | ts2hx.Num.toInt32(1.0)',
      ],
      ['-x', 'Float = -ts2hx.Ts2hx.toNumber(x)'],
      ['x > 5', 'Bool = ts2hx.Ts2hx.greaterThan(x, 5.0)'],
      ['n <= y', 'Bool = ts2hx.Ts2hx.lessEquals(n, y)'],
      ['y < t', 'Bool = ts2hx.Ts2hx.lessThan(y, t)'],
      ['x >= y', 'Bool = ts2hx.Ts2hx.greaterEquals(x, y)'],
    ];
    const hx = await moduleOf(
      [
        'function f(x: any, y: any, n: number, t: string): void {',
        ...operations.map(([ts], i) => `  const r${i} = ${ts};`),
        '  console.log(' + operations.map((_, i) => `r${i}`).join(', ') + ');',
        '}',
      ].join('\n'),
    );
    operations.forEach(([, haxe], i) => {
      expect(hx).toContain(`final r${i}:${haxe};`);
    });
  });

  it('keeps typed operators when no operand is any', async () => {
    const hx = await moduleOf(
      'function f(n: number, m: number, s: string): void { const a = n + m; const b = n < m; const c = s < s; console.log(a, b, c); }',
    );
    expect(hx).toContain('final a:Float = n + m;');
    expect(hx).toContain('final b:Bool = n < m;');
    expect(hx).toContain('final c:Bool = s < s;');
  });

  it('reads and writes compound assignments with an any operand once', async () => {
    const hx = await moduleOf(
      [
        'function f(o: { v: any; n: number }, xs: any[], i: number, a: any): void {',
        '  let s: any = "ab";',
        '  s += 1;',
        '  o.n += a;',
        '  o.v -= 2;',
        '  xs[i++] += a;',
        '}',
      ].join('\n'),
    );
    expect(hx).toContain('s = ts2hx.Ts2hx.add(s, 1.0);');
    expect(hx).toContain('o.n = ts2hx.Ts2hx.add(o.n, a);');
    expect(hx).toContain('o.v = ts2hx.Ts2hx.toNumber(o.v) - 2.0;');
    expect(hx).toMatch(
      /final (__\w+):Int = Std\.int\(i\+\+\);\s*xs\[\1\] = ts2hx\.Ts2hx\.add\(xs\[\1\], a\);/,
    );
  });

  it('makes truthiness explicit from the static type', async () => {
    const hx = await moduleOf(
      [
        'const n: number = 0;',
        "const s: string = '';",
        'function isEmpty(o: object | null): boolean { return !o; }',
        'const u: unknown = 1;',
        'const b: boolean = true;',
        'console.log(!n, !s, !u, !b);',
      ].join('\n'),
    );
    expect(hx).toContain('return !(o != null);');
    expect(hx).toContain(
      'ts2hx.Console.log(!ts2hx.Num.truthy(n), !ts2hx.Ts2hx.truthyString(s), !ts2hx.Ts2hx.truthy(u), !b);',
    );
  });

  it('keeps JS values for || and &&, evaluating the left side once', async () => {
    const hx = await moduleOf(
      "function f(): number { return 0; }\nconst x = f() || 42;\nconst y = 1 && 'yes';",
    );
    expect(hx).toMatch(
      /x = \{\s*final __value_1:Float = f\(\);\s*ts2hx\.Num\.truthy\(__value_1\) \? __value_1 : 42\.0;\s*\};/,
    );
    expect(hx).toContain(
      'y = ts2hx.Num.truthy(1.0) ? ((cast "yes" : Dynamic)) : ((cast 1.0 : Dynamic));',
    );
  });

  it('hoists var declarations to the top of their function', async () => {
    const hx = await moduleOf(
      'function f(): number {\n  if (true) {\n    var v = 1;\n  }\n  return v;\n}',
    );
    expect(hx).toMatch(
      /function f\(\):Float \{\s*var v:Null<Float> = null;\s*if \(true\) \{\s*v = 1\.0;\s*\}\s*return v;/,
    );
  });

  it('turns default parameters into optional ones and rest parameters into Haxe rest', async () => {
    const hx = await moduleOf(
      [
        "function greet(name: string, greeting = 'Hello'): string {",
        '  return greeting + name;',
        '}',
        'function sum(...nums: number[]): number {',
        '  return nums.length;',
        '}',
        'const values = [1, 2];',
        'console.log(sum(...values), sum(1, 2), greet("a"));',
      ].join('\n'),
    );
    expect(hx).toMatch(
      /function greet\(name:String, \?greeting:String\):String \{\s*if \(greeting == null\) \{\s*greeting = "Hello";/,
    );
    expect(hx).toMatch(
      /function sum\(\.\.\.__nums_\d+:Float\):Float \{\s*var nums:Array<Float> = __nums_\d+\.toArray\(\);/,
    );
    expect(hx).toContain('sum(...values)');
  });

  it('declares module-level bindings as module vars assigned by init', async () => {
    const hx = await moduleOf('let count = 1;\ncount += 2;');
    expect(hx).toContain('var count:Float;');
    expect(hx).toMatch(
      /function __init\(\):Void \{\s*count = 1\.0;\s*count \+= 2\.0;/,
    );
  });

  it('marks loop bindings captured by closures for per-iteration copies', async () => {
    const hx = await moduleOf(
      'const fs: Array<() => number> = [];\nfor (let i = 0; i < 3; i++) {\n  fs.push(() => i);\n}',
    );
    expect(hx).toMatch(
      /var __i\d+:Float = 0\.0;\s*while \(true\) \{\s*var i:Float = __i\d+;/,
    );
  });

  it('prints null and undefined in templates as constants', async () => {
    const hx = await moduleOf('console.log(`${null} ${undefined} ${true}`);');
    expect(hx).toContain(
      '"null" + " " + "undefined" + " " + ts2hx.Ts2hx.string(true)',
    );
  });

  it('resolves typeof statically for known types', async () => {
    const hx = await moduleOf(
      "const f = () => 1;\nconst u: unknown = 1;\nconsole.log(typeof 1, typeof 'x', typeof f, typeof {}, typeof u);",
    );
    expect(hx).toContain(
      'ts2hx.Console.log("number", "string", "function", "object", ts2hx.Ts2hx.typeOf(u));',
    );
  });

  it('keeps local function declarations in source order', async () => {
    const hx = await moduleOf(
      'function outer(): number {\n  const base = 10;\n  function add(n: number): number {\n    return base + n;\n  }\n  return add(1);\n}',
    );
    expect(hx).toMatch(
      /final base:Float = 10\.0;\s*function add\(n:Float\):Float \{\s*return base \+ n;\s*\}\s*return add\(1\.0\);/,
    );
  });

  it('declares functions used before their declaration as vars at the top of the block', async () => {
    const hx = await moduleOf(
      'function outer(n: number): boolean {\n  const r = isEven(n);\n  function isEven(k: number): boolean {\n    return k === 0 ? true : isOdd(k - 1);\n  }\n  function isOdd(k: number): boolean {\n    return k === 0 ? false : isEven(k - 1);\n  }\n  return r;\n}',
    );
    expect(hx).toMatch(
      /var isEven:\(k:Float\) -> Bool = null;\s*var isOdd:\(k:Float\) -> Bool = null;\s*isEven = \(function\(k:Float\):Bool \{[^}]*\}\);\s*isOdd = \(function\(k:Float\):Bool \{[^}]*\}\);\s*final r:Bool = isEven\(n\);\s*return r;/,
    );
  });

  it('assigns a function capturing a later const after that const', async () => {
    const hx = await moduleOf(
      "function outer(): string {\n  function greet(): string {\n    return name;\n  }\n  const name = 'x';\n  return greet();\n}",
    );
    expect(hx).toMatch(
      /var greet:\(\) -> String = null;\s*final name:String = "x";\s*greet = \(function\(\):String \{\s*return name;\s*\}\);\s*return greet\(\);/,
    );
  });

  it('resolves shorthand properties to the variable they read', async () => {
    const hx = await moduleOf(
      [
        'function a(): number {',
        '  const handlers = { onTick };',
        '  function onTick(): number {',
        '    return 1;',
        '  }',
        '  return handlers.onTick();',
        '}',
        'function b(): string {',
        '  function make(): { label: string } {',
        '    return { label };',
        '  }',
        "  const label = 'x';",
        '  return make().label;',
        '}',
      ].join('\n'),
    );
    expect(hx).toMatch(
      /var onTick:\(\) -> Float = null;\s*onTick = \(function\(\):Float \{\s*return 1\.0;\s*\}\);\s*final handlers/,
    );
    expect(hx).toMatch(
      /var make:[^=]+= null;\s*final label:String = "x";\s*make = /,
    );
  });

  it('hoists the consts a function captures when an earlier statement reaches it', async () => {
    const hx = await moduleOf(
      [
        'function outer(): number {',
        '  const g = h();',
        '  const y = 2;',
        '  function h(): () => number {',
        '    return k;',
        '  }',
        '  function k(): number {',
        '    return y;',
        '  }',
        '  return g();',
        '}',
      ].join('\n'),
    );
    expect(hx).toMatch(
      /var y:Null<Float> = null;\s*var h:\(\) -> \(\(\) -> Float\) = null;\s*var k:\(\) -> Float = null;\s*h = [^;]*;\s*\}\);\s*k = [^;]*;\s*\}\);\s*final g:\(\) -> Float = h\(\);\s*y = 2\.0;/,
    );
  });

  it('hoists the lets and consts a closure reads before their declaration', async () => {
    const hx = await moduleOf(
      [
        'function outer(): number {',
        '  const get = () => x;',
        '  const self = (): number => self();',
        '  const x = 1;',
        '  return get();',
        '}',
      ].join('\n'),
    );
    expect(hx).toMatch(
      /var x:Null<Float> = null;\s*final get:\(\) -> Float = function\(\):Float \{\s*return x;\s*\};/,
    );
    expect(hx).toMatch(/x = 1\.0;/);
    expect(hx).not.toMatch(/var self:Null/);
  });

  it('reports generic functions used before their declaration as unsupported', async () => {
    const { code, diagnostics } = await compileSources({
      'main.ts':
        'function outer(): number {\n  return id(1);\n  function id<T>(v: T): T {\n    return v;\n  }\n}',
    });
    expect(code['Main_2.hx']).toMatch(
      /var id:Dynamic = null;\s*id = \(\/\* TODO\(ts2hx\)/,
    );
    expect(diagnostics.map((d) => d.message)).toEqual([
      'TODO(ts2hx): generic function declarations used before their declaration are not supported yet',
    ]);
  });
  it('returns null where control reaches the end of a value-returning function', async () => {
    const hx = await moduleOf(
      [
        'function sign(n: number) {',
        '  if (n > 0) return 1;',
        '  if (n < 0) return -1;',
        '}',
        'function early(flag: boolean): string | undefined {',
        '  if (flag) return;',
        "  return 'late';",
        '}',
        'function fail(): never {',
        '  while (true) {}',
        '}',
        'function always(n: number): number {',
        '  if (n > 0) return 1;',
        '  fail();',
        '}',
        'function whole(): number {',
        '  return 1;',
        '}',
      ].join('\n'),
    );
    expect(hx).toMatch(
      /function sign\(n:Float\):Null<Float> \{[\s\S]*return -1\.0;\s*\}\s*return null;\s*\}/,
    );
    expect(hx).toMatch(/if \(flag\) \{\s*return null;\s*\}/);
    expect(hx).toMatch(/function whole\(\):Float \{\s*return 1\.0;\s*\}/);
    expect(hx).toMatch(/fail\(\);\s*throw "unreachable";/);
  });

  it('reads a void call used as a value as undefined', async () => {
    const hx = await moduleOf(
      [
        'function noop(): void {}',
        'function relay(): void {',
        '  return noop();',
        '}',
        'noop();',
        'console.log(noop());',
      ].join('\n'),
    );
    expect(hx).toMatch(/function relay\(\):Void \{\s*noop\(\);\s*return;\s*\}/);
    expect(hx).toMatch(/\n\tnoop\(\);\n/);
    expect(hx).toMatch(/ts2hx\.Console\.log\(\{\s*noop\(\);\s*null;\s*\}\);/);
  });

  it('reads a variable narrowed to undefined at runtime', async () => {
    const hx = await moduleOf(
      [
        'const f: (() => number) | undefined = undefined;',
        'console.log(f ? 1 : 2, !f, undefined ? 1 : 2);',
        'let found: number | undefined = undefined;',
        'const set = () => { found = 2; };',
        'set();',
        'console.log(found ? "yes" : "no", `${found}`);',
      ].join('\n'),
    );
    expect(hx).toContain(
      'ts2hx.Console.log(ts2hx.Ts2hx.truthy(f) ? 1.0 : 2.0, !ts2hx.Ts2hx.truthy(f), false ? 1.0 : 2.0);',
    );
    expect(hx).toContain('ts2hx.Ts2hx.truthy(found) ? "yes" : "no"');
    expect(hx).toMatch(
      /found == null \? "undefined" : ts2hx\.Ts2hx\.string\(found\)/,
    );
  });
});
