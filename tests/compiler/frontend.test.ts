import { compileSources } from './helpers';

async function initOf(source: string): Promise<string> {
  const { code } = await compileSources({ 'main.ts': source });
  const body = code['Main_2.hx'];
  return body.slice(body.indexOf('function __init():Void'));
}

describe('frontend', () => {
  it('emits the module, a Main that runs init then the event loop', async () => {
    const { code, diagnostics } = await compileSources(
      { 'hello.ts': "console.log('Hello, world!');" },
      { rootPackage: 'cases.basics.hello' },
    );
    expect(diagnostics).toEqual([]);
    expect(code).toEqual({
      'cases/basics/hello/Hello.hx':
        'package cases.basics.hello;\n\nfunction __init():Void {\n\tts2hx.Console.log("Hello, world!");\n}\n',
      'cases/basics/hello/Main.hx': `package cases.basics.hello;

class Main {
\tpublic static function main():Void {
\t\ttry {
\t\t\tcases.basics.hello.Hello.__init();
\t\t\tts2hx.EventLoop.run();
\t\t} catch (error:Dynamic) {
\t\t\tts2hx.Ts2hx.uncaught(error);
\t\t}
\t}
}
`,
    });
  });

  it('keeps Float arithmetic and formats numbers through the runtime', async () => {
    expect(
      await initOf(
        'console.log(0.1 + 0.2, -0, 2 ** 53, 10 % 4, NaN, -Infinity, 1e21);',
      ),
    ).toContain(
      'ts2hx.Console.log(ts2hx.Console.inspectNumber(0.1 + 0.2), ts2hx.Console.inspectNumber(-0.0), ' +
        'ts2hx.Console.inspectNumber(ts2hx.Num.pow(2.0, 53.0)), ts2hx.Console.inspectNumber(10.0 % 4.0), ' +
        'ts2hx.Console.inspectNumber(Math.NaN), ts2hx.Console.inspectNumber(-Math.POSITIVE_INFINITY), ' +
        'ts2hx.Console.inspectNumber(1.0e+21));',
    );
  });

  it('converts to strings with JS semantics in String(), templates and +', async () => {
    const init = await initOf(
      "console.log(String(-0), `a${1 / 3}b${'s'}`, 'x' + -0, 1 + 'y', String(true), String());",
    );
    expect(init).toContain(
      'ts2hx.Console.log(ts2hx.Num.toString(-0.0), "a" + ts2hx.Num.toString(1.0 / 3.0) + "b" + "s", ' +
        '"x" + ts2hx.Num.toString(-0.0), ts2hx.Num.toString(1.0) + "y", ts2hx.Ts2hx.string(true), "");',
    );
  });

  it('turns unmapped constructs into reported, throwing placeholders', async () => {
    const { code, diagnostics } = await compileSources({
      'main.ts':
        'class A {}\nconst x = { a: 1 };\nconsole.log(x?.a, new Date());',
    });
    expect(code['Main_2.hx']).toMatchSnapshot();
    expect(diagnostics).toEqual([
      expect.objectContaining({
        severity: 'warning',
        message: 'TODO(ts2hx): ClassDeclaration is not supported yet',
        line: 1,
        column: 1,
      }),
      expect.objectContaining({
        message: 'TODO(ts2hx): PropertyAccessExpression is not supported yet',
        line: 3,
        column: 13,
      }),
      expect.objectContaining({
        message: 'TODO(ts2hx): NewExpression is not supported yet',
        line: 3,
      }),
    ]);
  });

  it('emits only typedefs for type-only and import/export declarations', async () => {
    const { code, diagnostics } = await compileSources({
      'main.ts':
        "import { v } from './other';\nexport * from './other';\ninterface I { a: number }\ntype T = I;\n;",
      'other.ts': 'export const v = 1;',
    });
    expect(code['Main_2.hx']).toBe(
      'typedef I = { var a:Float; };\n\ntypedef T = Main_2.I;\n\nfunction __init():Void {}\n',
    );
    expect(diagnostics).toEqual([]);
  });

  it('binds lib symbols, not names: a user `String` or `console` is not the lib one', async () => {
    const { code, diagnostics } = await compileSources({
      'main.ts':
        'function String(x: number) { return x; }\nconst console = { log(x: string) {} };\nconsole.log(String(1) + "");',
    });
    expect(diagnostics).toEqual([]);
    expect(code['Main_2.hx']).toContain(
      'console.log(ts2hx.Num.toString(String(1.0)));',
    );
  });

  it('binds `Console.log` only on the lib `console` value, never dropping its receiver', async () => {
    const { code, diagnostics } = await compileSources({
      'main.ts': [
        'console.log("a");',
        '(console).log("b");',
        '(console.log("c"), console).log("d");',
        'const logger = console;',
        'logger.log("e");',
      ].join('\n'),
    });
    const init = code['Main_2.hx'];
    expect(init).toContain('ts2hx.Console.log("a");');
    expect(init).toContain('ts2hx.Console.log("b");');
    expect(init).not.toContain('ts2hx.Console.log("d")');
    expect(init).not.toContain('ts2hx.Console.log("e")');
    expect(diagnostics.map((d) => `${d.line}: ${d.message}`)).toEqual(
      expect.arrayContaining([
        '3: TODO(ts2hx): CallExpression is not supported yet',
        '5: TODO(ts2hx): CallExpression is not supported yet',
      ]),
    );
  });
  it('casts unions to the checker-narrowed type for discriminants, typeof and in', async () => {
    const { code, diagnostics } = await compileSources({
      'main.ts': `type Shape = { kind: 'c'; r: number } | { kind: 's'; side: number };
function area(s: Shape): number { if (s.kind === 'c') return s.r; return s.side; }
function len(v: string | number): number { if (typeof v === 'string') return v.length; return v; }
function fly(a: { fly(): void } | { swim(): void }): void { if ('fly' in a) a.fly(); }`,
    });
    expect(diagnostics).toEqual([]);
    const body = code['Main_2.hx'];
    expect(body).toContain('function area(s:Dynamic):Float {');
    expect(body).toContain('if (((cast s.kind : String)) == "c") {');
    expect(body).toContain(
      'return ((cast s : { var kind:String; var r:Float; })).r;',
    );
    expect(body).toContain(
      'return ((cast s : { var kind:String; var side:Float; })).side;',
    );
    expect(body).toContain('if (ts2hx.Ts2hx.typeOf(v) == "string") {');
    expect(body).toContain('return ((cast v : String)).length;');
    expect(body).toContain('return (cast v : Float);');
    expect(body).toContain('if (Reflect.hasField(a, "fly")) {');
    expect(body).toContain('((cast a : { function fly():Void; })).fly();');
  });

  it('maps Record and index-signature reads, writes, in, delete and keys onto ts2hx.Dict', async () => {
    expect(
      await initOf(`const d: Record<string, number> = { a: 1, 2: 2 };
d['b'] = 3; d.c = 4; d.a += 1;
console.log('a' in d, delete d.a, Object.keys(d), {} as Record<string, number>);`),
    ).toBe(
      'function __init():Void {\n' +
        '\td = ts2hx.Dict.of(["a", "2"], [1.0, 2.0]);\n' +
        '\td.set("b", 3.0);\n' +
        '\td.set("c", 4.0);\n' +
        '\td.set("a", d.get("a") + 1.0);\n' +
        '\tts2hx.Console.log(d.exists("a"), d.remove("a"), d.keys(), new ts2hx.Dict<Float>());\n' +
        '}\n',
    );
  });

  it('builds a ts2hx.Dict for literals in optional or undefined-able Record positions', async () => {
    const init =
      await initOf(`const o: { counts?: Record<string, number> } = { counts: { a: 1 } };
const u: Record<string, number> | undefined = { b: 2 };
function f(d?: Record<string, number>): number { return d ? Object.keys(d).length : 0; }
console.log(f({ c: 3 }), u, o);`);
    expect(init).toContain('counts: ts2hx.Dict.of(["a"], [1.0])');
    expect(init).toContain('u = ts2hx.Dict.of(["b"], [2.0]);');
    expect(init).toContain('f(ts2hx.Dict.of(["c"], [3.0]))');
  });

  it('reports an unsupported node inside an assignment target once', async () => {
    const { diagnostics } = await compileSources({
      'main.ts': '(new Date() as any).x = 1;',
    });
    expect(diagnostics.map((d) => d.message)).toEqual([
      'TODO(ts2hx): NewExpression is not supported yet',
    ]);
  });

  it('casts tuple element reads, truncates Float indexes and maps array checks', async () => {
    const init = await initOf(`const t: [string, number] = ['a', 1];
const xs: number[] = [1, 2]; let i = 1;
console.log(t[0], xs[i], xs[0], Array.isArray(xs), (xs as unknown) instanceof Array);`);
    expect(init).toContain('t = [(cast "a" : Dynamic), (cast 1.0 : Dynamic)];');
    expect(init).toContain(
      'ts2hx.Console.log((cast t[0] : String), ts2hx.Console.inspectNumber(xs[Std.int(i)]), ' +
        'ts2hx.Console.inspectNumber(xs[0]), Std.isOfType(xs, Array), Std.isOfType((cast xs : Any), Array));',
    );
  });

  describe('modules', () => {
    it('references imported values as pack.Module.field, local ones by name', async () => {
      const { code, diagnostics } = await compileSources(
        {
          'main.ts': [
            "import inc, { cast as c, N } from './lib/util';",
            "import * as util from './lib/util';",
            'function f(cases: number) { return cases; }',
            'console.log(inc(c(N)), util.N, f(util.cast(1)));',
          ].join('\n'),
          'lib/util.ts': [
            'export const N = 1 + 1;',
            'export function cast(x: number) { return x + N; }',
            'export default function (x: number) { return x + 1; }',
          ].join('\n'),
        },
        { rootPackage: 'cases.m' },
      );
      expect(diagnostics).toEqual([]);
      expect(code['cases/m/Main_2.hx']).toContain(
        'ts2hx.Console.log(ts2hx.Console.inspectNumber(cases.m.lib.Util.default_(cases.m.lib.Util.cast_(cases.m.lib.Util.N))), ' +
          'ts2hx.Console.inspectNumber(cases.m.lib.Util.N), ts2hx.Console.inspectNumber(f(cases.m.lib.Util.cast_(1.0))));',
      );
      expect(code['cases/m/Main_2.hx']).toContain(
        'function f(cases_:Float):Float {\n\treturn cases_;\n}',
      );
      expect(code['cases/m/lib/Util.hx']).toContain(
        'function cast_(x:Float):Float {\n\treturn x + N;\n}',
      );
    });

    it('assigns `export default <expression>` in the module init', async () => {
      const { code } = await compileSources({
        'main.ts': "import d from './d';\nconsole.log(d);",
        'd.ts': "export default 'a' + 'b';",
      });
      expect(code['D.hx']).toBe(
        'var default_:String;\n\nfunction __init():Void {\n\tdefault_ = "a" + "b";\n}\n',
      );
      expect(code['Main_2.hx']).toContain('ts2hx.Console.log(D.default_);');
    });

    it('emits nothing for re-export-only modules and leaves them out of Main', async () => {
      const { code, diagnostics } = await compileSources({
        'main.ts': "import { v } from './index';\nconsole.log(v);",
        'index.ts': "export * from './impl';",
        'impl.ts': 'export const v = 1;',
      });
      expect(diagnostics).toEqual([]);
      expect(Object.keys(code).sort()).toEqual([
        'Impl.hx',
        'Main.hx',
        'Main_2.hx',
      ]);
      expect(code['Main.hx']).toContain(
        '\t\t\tImpl.__init();\n\t\t\tMain_2.__init();\n',
      );
    });

    it('rejects a namespace object used as a value', async () => {
      const { diagnostics } = await compileSources({
        'main.ts': "import * as ns from './ns';\nconsole.log(ns);",
        'ns.ts': 'export const v = 1;',
      });
      expect(diagnostics).toEqual([
        expect.objectContaining({
          message:
            'TODO(ts2hx): a module namespace object used as a value is not supported yet',
        }),
      ]);
    });
  });
});
