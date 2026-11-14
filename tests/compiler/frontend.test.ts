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
        'ts2hx.Console.inspectNumber(Math.pow(2.0, 53.0)), ts2hx.Console.inspectNumber(10.0 % 4.0), ' +
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
      'main.ts': 'class A {}\nlet x = 1;\nconsole.log(x, [1].length);',
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
        message: 'TODO(ts2hx): VariableStatement is not supported yet',
        line: 2,
      }),
      expect.objectContaining({
        message: 'TODO(ts2hx): Identifier is not supported yet',
        line: 3,
        column: 13,
      }),
      expect.objectContaining({
        message: 'TODO(ts2hx): PropertyAccessExpression is not supported yet',
        line: 3,
      }),
    ]);
  });

  it('emits nothing for type-only and import/export declarations', async () => {
    const { code, diagnostics } = await compileSources({
      'main.ts':
        "import { v } from './other';\nexport * from './other';\ninterface I { a: number }\ntype T = I;\n;",
      'other.ts': 'export const v = 1;',
    });
    expect(code['Main_2.hx']).toBe('function __init():Void {}\n');
    expect(diagnostics.map((d) => d.line)).toEqual([1]);
  });

  it('binds lib symbols, not names: a user `String` or `console` is not the lib one', async () => {
    const { diagnostics } = await compileSources({
      'main.ts':
        'function String(x: number) { return x; }\nconst console = { log(x: string) {} };\nconsole.log(String(1) + "");',
    });
    const messages = diagnostics.map((d) => `${d.line}: ${d.message}`);
    expect(messages).toContain(
      '3: TODO(ts2hx): CallExpression is not supported yet',
    );
    expect(messages).not.toContain(expect.stringMatching(/^3: .*Binary/));
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
});
