import { compileSources } from './helpers';

async function moduleOf(lines: string[]): Promise<string> {
  const { code, diagnostics } = await compileSources({
    'main.ts': lines.join('\n'),
  });
  expect(diagnostics).toEqual([]);
  return code['Main_2.hx'];
}

describe('stdlib: RegExp', () => {
  it('compiles literals and constructors to ts2hx.RegExp', async () => {
    const hx = await moduleOf([
      'const re = /(?<x>a)\\/-/gi;',
      "console.log(re, new RegExp('a', 'g'), RegExp(re));",
    ]);
    expect(hx).toContain('var re:ts2hx.RegExp;');
    expect(hx).toContain('re = new ts2hx.RegExp("(?<x>a)\\\\/-", "gi");');
    expect(hx).toContain('new ts2hx.RegExp("a", "g")');
    expect(hx).toContain('ts2hx.RegExp.from(re)');
  });

  it('binds exec, test, lastIndex and the match array extras', async () => {
    const hx = await moduleOf([
      'const re = /(?<x>a)/g;',
      "const m = re.exec('a');",
      're.lastIndex = 0;',
      "console.log(re.test('a'), re.flags, re.lastIndex, m?.index, m?.input, m?.groups);",
    ]);
    expect(hx).toContain('var m:Array<String>;');
    expect(hx).toContain('m = re.exec("a");');
    expect(hx).toContain('re.lastIndex = 0.0;');
    expect(hx).toContain(
      're.test("a"), re.flags, ts2hx.Console.inspectNumber(re.lastIndex)',
    );
    expect(hx).toContain('ts2hx.RegExp.matchIndex(');
    expect(hx).toContain('ts2hx.RegExp.matchInput(');
    expect(hx).toContain('ts2hx.RegExp.matchGroups(');
  });

  it('routes string methods with a RegExp argument to the RegExp runtime', async () => {
    const hx = await moduleOf([
      "const s: string = 'a-b';",
      "console.log(s.split(/-/, 2), s.split('-'), s.search(/b/), s.match(/a/g), s.match('a'), s.replaceAll(/a/g, '$&$&'));",
    ]);
    expect(hx).toContain(
      'ts2hx.RegExp.split(s, new ts2hx.RegExp("-", ""), 2.0)',
    );
    expect(hx).toContain('ts2hx.JsString.split(s, "-")');
    expect(hx).toContain('ts2hx.RegExp.search(s, new ts2hx.RegExp("b", ""))');
    expect(hx).toContain('ts2hx.RegExp.match(s, new ts2hx.RegExp("a", "g"))');
    expect(hx).toContain('ts2hx.RegExp.match(s, new ts2hx.RegExp("a"))');
    expect(hx).toContain(
      'ts2hx.RegExp.replaceAll(s, new ts2hx.RegExp("a", "g"), "$&$&")',
    );
  });

  it('wraps replacer functions into an argument-array callback', async () => {
    const hx = await moduleOf([
      "const s: string = 'ab';",
      'function upper(m: string): string { return m.toUpperCase(); }',
      'console.log(s.replace(/(a)/, (m, p1: string) => p1 + m), s.replace(/b/g, upper));',
    ]);
    expect(hx).toMatch(
      /ts2hx\.RegExp\.replaceWith\(s, new ts2hx\.RegExp\("\(a\)", ""\), function\(__args_\d+:Array<Dynamic>\):String/,
    );
    expect(hx).toMatch(
      /\(cast __args_\d+\[0\] : String\), \(cast __args_\d+\[1\] : String\)/,
    );
    expect(hx).toMatch(
      /ts2hx\.RegExp\.replaceWith\(s, new ts2hx\.RegExp\("b", "g"\), function\(__args_\d+:Array<Dynamic>\):String \{\s*return upper\(\(cast __args_\d+\[0\] : String\)\);/,
    );
  });

  it('iterates matchAll through toArray in for-of, spread and Array.from', async () => {
    const hx = await moduleOf([
      "const s: string = 'aa';",
      'for (const m of s.matchAll(/a/g)) console.log(m[0]);',
      "console.log([...s.matchAll(/a/g)], Array.from(s.matchAll(/a/g), (m) => m.index), s.matchAll('a'));",
    ]);
    expect(hx).toContain(
      'for (m in ts2hx.RegExp.matchAll(s, new ts2hx.RegExp("a", "g")).toArray())',
    );
    expect(hx).toContain(
      'ts2hx.Console.log(ts2hx.RegExp.matchAll(s, new ts2hx.RegExp("a", "g")).toArray(), ts2hx.JsArray.from(ts2hx.RegExp.matchAll(s, new ts2hx.RegExp("a", "g")).toArray(), function(m:Array<String>',
    );
    expect(hx).toContain(
      'ts2hx.RegExp.matchAll(s, new ts2hx.RegExp("a", "g")))',
    );
  });
});
