import { compileSources } from './helpers';

async function moduleOf(lines: string[]): Promise<string> {
  const { code, diagnostics } = await compileSources({
    'main.ts': lines.join('\n'),
  });
  expect(diagnostics).toEqual([]);
  return code['Main_2.hx'];
}

describe('stdlib: Promise and timers', () => {
  it('maps Promise<T> to ts2hx.Promise<T>, with void as Dynamic', async () => {
    const hx = await moduleOf([
      'const n: Promise<number> = Promise.resolve(1);',
      'const v: Promise<void> = Promise.resolve();',
      'console.log(n, v);',
    ]);
    expect(hx).toContain('var n:ts2hx.Promise<Float>;');
    expect(hx).toContain('var v:ts2hx.Promise<Dynamic>;');
    expect(hx).toContain(
      '(cast ts2hx.Promise.resolve(1.0) : ts2hx.Promise<Float>)',
    );
    expect(hx).toContain(
      '(cast ts2hx.Promise.resolve() : ts2hx.Promise<Dynamic>)',
    );
  });

  it('calls then/catch/finally on the abstract, with callbacks padded to one argument', async () => {
    const hx = await moduleOf([
      'const p = Promise.resolve(1);',
      "p.then(() => 'x').catch(() => 'y').finally(() => console.log('f'));",
      'p.then((n) => n + 1, (e: unknown) => 0);',
    ]);
    expect(hx).toMatch(
      /\(cast p\.then\(function\(__unused_\d+:Float\):String \{\s*return "x";\s*\}\) : ts2hx\.Promise<String>\)\)\.catchError\(function\(__unused_\d+:Dynamic\):String/,
    );
    expect(hx).toMatch(/\.finally\(function\(\):Void \{/);
    expect(hx).toMatch(
      /p\.then\(function\(n:Float\):Float \{\s*return n \+ 1\.0;\s*\}, function\(e:Any\):Float/,
    );
  });

  it('constructs promises with a two-argument executor and pads omitted void arguments', async () => {
    const hx = await moduleOf([
      'new Promise<void>((resolve) => resolve());',
      'const all = Promise.all([Promise.resolve(1), 2]);',
      'console.log(all);',
    ]);
    expect(hx).toMatch(
      /new ts2hx\.Promise<Dynamic>\(function\(resolve:\(value:Dynamic\) -> Void, __unused_\d+:Dynamic\):Void \{\s*resolve\(null\);/,
    );
    expect(hx).toContain('ts2hx.Promise.all([');
    expect(hx).toContain('ts2hx.Promise<Array<Dynamic>>');
  });

  it('binds timers and microtasks to ts2hx.EventLoop', async () => {
    const hx = await moduleOf([
      "const t = setTimeout((a: string) => console.log(a), 5, 'x');",
      "const i = setInterval(() => console.log('i'));",
      'clearTimeout(t);',
      'clearInterval(i);',
      "queueMicrotask(() => console.log('m'));",
    ]);
    expect(hx).toContain('var t:ts2hx.EventLoop.Timeout;');
    expect(hx).toMatch(
      /t = ts2hx\.EventLoop\.setTimeout\(function\(a:String\):Void \{[^}]*\}, 5\.0, \["x"\]\);/,
    );
    expect(hx).toMatch(
      /i = ts2hx\.EventLoop\.setInterval\(function\(\):Void \{[^}]*\}, null\);/,
    );
    expect(hx).toContain('ts2hx.EventLoop.clearTimeout(t);');
    expect(hx).toContain('ts2hx.EventLoop.clearTimeout(i);');
    expect(hx).toContain('ts2hx.EventLoop.queueMicrotask(function():Void {');
  });

  it('binds AggregateError and allSettled result fields', async () => {
    const hx = await moduleOf([
      'Promise.allSettled([Promise.resolve(1)]).then((rs) => {',
      "  for (const r of rs) console.log(r.status === 'fulfilled' ? r.value : r.reason);",
      '});',
      "const e = new AggregateError([1], 'all');",
      'console.log(e.errors.length);',
    ]);
    expect(hx).toContain(
      'new ts2hx.Error.AggregateError((cast [1.0] : ts2hx.Iter.JsIterable<Dynamic>), "all")',
    );
    expect(hx).toContain('e.errors.length');
    expect(hx).toMatch(/r\.status == "fulfilled"/);
    expect(hx).toMatch(/r\.value/);
    expect(hx).toMatch(/r\.reason/);
  });
});
