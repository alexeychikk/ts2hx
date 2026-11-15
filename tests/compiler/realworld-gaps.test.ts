import { compileSources } from './helpers';

async function moduleOf(source: string): Promise<string> {
  const { code, diagnostics } = await compileSources({ 'main.ts': source });
  expect(diagnostics).toEqual([]);
  return code['Main_2.hx'];
}

describe('frontend: gaps found by the realworld/interpreter case', () => {
  it('widens an Int value to Float in an object literal field', async () => {
    const hx = await moduleOf(
      "const xs = [1, 2];\nconst stats = { count: xs.length, label: 'n' };\nconsole.log(stats);",
    );
    expect(hx).toContain('{count: (cast xs.length : Float), label: "n"}');
  });

  it('wraps a resolve function passed as a timer callback', async () => {
    const hx = await moduleOf(
      "const p = new Promise<void>((resolve) => setTimeout(resolve, 5));\np.then(() => console.log('done'));",
    );
    expect(hx).toContain('ts2hx.EventLoop.setTimeout(function():Void {');
    expect(hx).toContain('resolve(null);');
    expect(hx).not.toContain('unsupported');
  });

  it('turns an abstract property implemented by an accessor into a virtual property', async () => {
    const hx = await moduleOf(
      [
        'abstract class A {',
        '  abstract readonly arity: number;',
        '  describe(): string { return `${this.arity}`; }',
        '}',
        'class B extends A { get arity(): number { return 2; } }',
        'console.log(new B().describe());',
      ].join('\n'),
    );
    expect(hx).toContain('public var arity(get, set):Float;');
    expect(hx).toContain('public function get_arity():Float {');
    expect(hx).toContain('public override function get_arity():Float {');
  });

  it('keeps typeof dynamic on unknown narrowed by a nullish check', async () => {
    const hx = await moduleOf(
      "function kind(data: unknown): string {\n  if (data === null) return 'nil';\n  return typeof data;\n}\nconsole.log(kind(1));",
    );
    expect(hx).toContain('return ts2hx.Ts2hx.typeOf(data);');
  });

  it('converts unknown cast to a Record through Dict.from', async () => {
    const hx = await moduleOf(
      "function keys(data: unknown): string[] {\n  return Object.keys(data as Record<string, unknown>);\n}\nconsole.log(keys(JSON.parse('{}')));",
    );
    expect(hx).toContain('ts2hx.Dict.from(data).keys()');
  });

  it('drops `?? null` on a nullable value', async () => {
    const hx = await moduleOf(
      'const items: Array<number | null> = [1];\nconst last = items.pop() ?? null;\nconsole.log(last);',
    );
    expect(hx).toContain('last = ts2hx.JsArray.pop(items);');
  });

  it('pads a function literal declaring fewer parameters than its function type', async () => {
    const hx = await moduleOf(
      [
        'type Impl = (args: number[], pos: string, extra?: boolean) => number;',
        "const table: Array<[string, Impl]> = [['a', (args) => args.length]];",
        'const f: Impl = () => 1;',
        "console.log(table[0][1]([1], 'p'), f([], ''));",
      ].join('\n'),
    );
    expect(hx).toContain(
      'function(args:Array<Float>, __unused_1:String, ?__unused_2:Null<Bool>):Float',
    );
    expect(hx).toContain(
      'function(__unused_3:Array<Float>, __unused_4:String, ?__unused_5:Null<Bool>):Float',
    );
  });
});
