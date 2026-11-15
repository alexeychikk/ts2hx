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

describe('stdlib: strings', () => {
  it('binds String.prototype methods to JsString static calls', async () => {
    const hx = await moduleOf([
      "const s: string = 'hello';",
      "console.log(s.slice(1, 3), s.padStart(8, '*'), s.at(-1), s.charCodeAt(9), s.trimEnd(), s.toLocaleUpperCase());",
    ]);
    expect(hx).toContain('ts2hx.JsString.slice(s, 1.0, 3.0)');
    expect(hx).toContain('ts2hx.JsString.padStart(s, 8.0, "*")');
    expect(hx).toContain('ts2hx.JsString.at(s, -1.0)');
    expect(hx).toContain('ts2hx.JsString.charCodeAt(s, 9.0)');
    expect(hx).toContain('ts2hx.JsString.trimEnd(s)');
    expect(hx).toContain('ts2hx.JsString.toUpperCase(s)');
  });

  it('reads s[i] through JsString.index', async () => {
    const hx = await moduleOf([
      "const s: string = 'abc';",
      'console.log(s[1]);',
    ]);
    expect(hx).toContain('ts2hx.JsString.index(s, 1.0)');
  });

  it('picks the replacer variant and pads its parameters', async () => {
    const hx = await moduleOf([
      "const s: string = 'hello';",
      "console.log(s.replace('l', 'L'), s.replaceAll('l', (m) => m + m));",
    ]);
    expect(hx).toContain('ts2hx.JsString.replace(s, "l", "L")');
    expect(hx).toMatch(
      /ts2hx\.JsString\.replaceAllWith\(s, "l", function\(m:String, __unused_\d+:Float, __unused_\d+:String\):String/,
    );
  });

  it('leaves RegExp arguments to the RegExp binding', async () => {
    const hx = await moduleOf([
      "const s: string = 'a-b';",
      "console.log(s.split('-'), s.split(/-/));",
    ]);
    expect(hx).toContain('ts2hx.JsString.split(s, "-")');
    expect(hx).toContain('ts2hx.RegExp.split(s, new ts2hx.RegExp("-", ""))');
  });

  it('converts concat arguments with String()', async () => {
    const hx = await moduleOf([
      "const s: string = 'a';",
      'console.log(s.concat(1, s));',
    ]);
    expect(hx).toContain(
      'ts2hx.JsString.concat(s, ts2hx.Num.toString(1.0), s)',
    );
  });

  it('binds String statics and String.raw', async () => {
    const hx = await moduleOf([
      'const n: number = 1;',
      'console.log(String.fromCharCode(72, 105), String.fromCodePoint(0x1f600), String.raw`a\\n${n}b`);',
    ]);
    expect(hx).toContain('ts2hx.JsString.fromCharCode(72.0, 105.0)');
    expect(hx).toContain('ts2hx.JsString.fromCodePoint(128512.0)');
    expect(hx).toContain('"a\\\\n" + ts2hx.Num.toString(n) + "b"');
  });

  it('iterates strings by code point in for…of and spread', async () => {
    const hx = await moduleOf([
      "const s: string = 'ab';",
      'for (const c of s) console.log(c);',
      'const a: number[] = [1];',
      'console.log([...s], [0, ...a, 2]);',
    ]);
    expect(hx).toContain('for (c in ts2hx.JsString.codePoints(s))');
    expect(hx).toContain('ts2hx.JsString.codePoints(s)');
    expect(hx).toMatch(/\[0\.0\]\.concat\(a\)\.concat\(\[2\.0\]\)/);
  });

  it('copies a lone array spread', async () => {
    const hx = await moduleOf([
      'const a: number[] = [1];',
      'console.log([...a]);',
    ]);
    expect(hx).toContain('a.copy()');
  });

  it('appends spreads of another element type one element at a time', async () => {
    const hx = await moduleOf([
      "const s: string = 'ab';",
      "const strs: string[] = ['x'];",
      'const a: (string | number)[] = [...s, 1];',
      'const b: (string | number)[] = [1, ...strs];',
    ]);
    expect(hx).not.toContain('concat');
    expect(hx).toMatch(
      /final (\w+):Array<Dynamic> = \[\];\s+for \((\w+) in ts2hx\.JsString\.codePoints\(s\)\) \{\s+\1\.push\(\(cast \2 : Dynamic\)\);\s+\}\s+\1\.push\(\(cast 1\.0 : Dynamic\)\);\s+\1;/,
    );
    expect(hx).toMatch(
      /final (\w+):Array<Dynamic> = \[\(cast 1\.0 : Dynamic\)\];\s+for \((\w+) in strs\) \{\s+\1\.push\(\(cast \2 : Dynamic\)\);/,
    );
  });
});

describe('stdlib: numbers and Math', () => {
  it('binds Number methods and the global parse functions to Num', async () => {
    const hx = await moduleOf([
      'const n: number = 255;',
      "console.log(n.toString(), n.toString(16), n.toFixed(2), n.toPrecision(3), n.toExponential(1), parseInt('ff', 16), Number.parseFloat('1.5'));",
    ]);
    expect(hx).toContain('ts2hx.Num.toString(n)');
    expect(hx).toContain('ts2hx.Num.toStringRadix(n, 16.0)');
    expect(hx).toContain('ts2hx.Num.toFixed(n, 2.0)');
    expect(hx).toContain('ts2hx.Num.toPrecision(n, 3.0)');
    expect(hx).toContain('ts2hx.Num.toExponential(n, 1.0)');
    expect(hx).toContain('ts2hx.Num.parseInt("ff", 16.0)');
    expect(hx).toContain('ts2hx.Num.parseFloat("1.5")');
  });

  it('converts strings for the global isNaN but not Number.isNaN', async () => {
    const hx = await moduleOf([
      'const n: number = 1;',
      "console.log(isNaN(n), isNaN('x'), Number.isNaN(n), Number.isInteger(n), Number.isSafeInteger(n));",
    ]);
    expect(hx).toContain('Math.isNaN(n)');
    expect(hx).toContain('Math.isNaN(ts2hx.Num.fromString("x"))');
    expect(hx).toContain('ts2hx.Num.isInteger(n)');
    expect(hx).toContain('ts2hx.Num.isSafeInteger(n)');
  });

  it('routes Math to Haxe Math or JsMath and pads missing arguments with NaN', async () => {
    const hx = await moduleOf([
      'const n: number = 2.5;',
      'console.log(Math.round(n), Math.sqrt(n), Math.max(1, n), Math.hypot(), Math.cbrt(n), Math.atan2(1), Math.pow(n, 2));',
    ]);
    expect(hx).toContain('ts2hx.JsMath.round(n)');
    expect(hx).toContain('Math.sqrt(n)');
    expect(hx).toContain('ts2hx.JsMath.max(1.0, n)');
    expect(hx).toContain('ts2hx.JsMath.hypot()');
    expect(hx).toContain('ts2hx.JsMath.cbrt(n)');
    expect(hx).toContain('Math.atan2(1.0, Math.NaN)');
    expect(hx).toContain('ts2hx.Num.pow(n, 2.0)');
  });

  it('inlines Math and Number constants', async () => {
    const hx = await moduleOf([
      'console.log(Math.PI, Number.MAX_SAFE_INTEGER, Number.EPSILON);',
    ]);
    expect(hx).toContain('3.141592653589793');
    expect(hx).toContain('9007199254740991.0');
    expect(hx).toContain('2.220446049250313e-16');
  });
});
