import { constExpr, FLOAT, STRING, VOID } from '@src/compiler/ir/builders';
import type { HxExpr, HxModule, HxStmt, HxType } from '@src/compiler/ir/types';
import { createPassContext, runPasses } from '@src/compiler/passes';
import { lowerFinally } from '@src/compiler/passes/lower-finally';
import { printStmts } from '@src/compiler/printer/printer';

import { compileSources } from './helpers';

const call = (name: string): HxStmt => ({
  kind: 'expr',
  expr: {
    kind: 'call',
    callee: { kind: 'local', name, type: { kind: 'dynamic' } },
    args: [],
    type: { kind: 'dynamic' },
  },
});
const local = (name: string): HxExpr => ({ kind: 'local', name, type: FLOAT });

function lowered(body: HxStmt[], ret: HxType = STRING): string {
  const module: HxModule = {
    pack: [],
    name: 'Main',
    sourceFile: 'main.ts',
    imports: [],
    decls: [
      {
        kind: 'moduleFunction',
        name: 'f',
        fn: { typeParams: [], params: [], ret, body },
      },
    ],
    init: [],
  };
  const [decl] = runPasses(
    module,
    createPassContext(() => {}),
  ).decls;
  return decl.kind === 'moduleFunction' ? printStmts(decl.fn.body ?? []) : '';
}

function lines(...text: string[]): string {
  return text.join('\n');
}

describe('lowerFinally', () => {
  it('records a return in try, runs finally, then resumes it', () => {
    expect(
      lowered([
        {
          kind: 'tryFinally',
          body: [{ kind: 'return', value: constExpr('try') }],
          finally: [call('cleanup')],
        },
      ]),
    ).toBe(
      lines(
        '{',
        '\tvar __completion1:Int = 0;',
        '\tvar __error3:Dynamic = null;',
        '\tvar __result2:Null<String> = null;',
        '\ttry {',
        '\t\tdo {',
        '\t\t\t{',
        '\t\t\t\t__result2 = "try";',
        '\t\t\t\t__completion1 = 2;',
        '\t\t\t\tbreak;',
        '\t\t\t}',
        '\t\t} while (false);',
        '\t} catch (__thrown5:Dynamic) {',
        '\t\t__error3 = __thrown5;',
        '\t\t__completion1 = 1;',
        '\t}',
        '\tcleanup();',
        '\tif (__completion1 == 1) {',
        '\t\tthrow __error3;',
        '\t} else if (__completion1 == 2) {',
        '\t\treturn __result2;',
        '\t}',
        '}',
        'throw "unreachable";',
      ),
    );
  });

  it('runs the catch body under a try of its own, so a throw from it still runs finally', () => {
    const out = lowered(
      [
        {
          kind: 'tryFinally',
          body: [call('work')],
          catch: {
            name: 'e',
            type: { kind: 'dynamic' },
            body: [{ kind: 'throw', value: local('e') }],
          },
          finally: [call('cleanup')],
        },
      ],
      VOID,
    );
    expect(out).toContain(
      lines(
        '\t} catch (e:Dynamic) {',
        '\t\ttry {',
        '\t\t\tthrow e;',
        '\t\t} catch (__thrown6:Dynamic) {',
        '\t\t\t__error3 = __thrown6;',
        '\t\t\t__completion1 = 1;',
        '\t\t}',
        '\t}',
        '\tcleanup();',
      ),
    );
    expect(out).not.toContain('__result');
  });

  it('records only the jumps that leave the try: inner loops keep theirs', () => {
    const out = lowered(
      [
        {
          kind: 'while',
          cond: constExpr(true),
          doWhile: false,
          body: [
            {
              kind: 'tryFinally',
              body: [
                {
                  kind: 'while',
                  cond: constExpr(true),
                  doWhile: false,
                  body: [{ kind: 'break' }],
                },
                { kind: 'continue' },
              ],
              finally: [call('cleanup')],
            },
          ],
        },
      ],
      VOID,
    );
    expect(out).toContain('\t\t\t\t\twhile (true) {\n\t\t\t\t\t\tbreak;');
    expect(out).toContain('__completion1 = 2;');
    expect(out).toContain(
      lines('\t\t} else if (__completion1 == 2) {', '\t\t\tcontinue;', '\t\t}'),
    );
    expect(out).not.toContain('throw "unreachable"');
  });

  it('leaves jumps inside finally alone, so they override the completion', () => {
    const module: HxModule = {
      pack: [],
      name: 'Main',
      sourceFile: 'main.ts',
      imports: [],
      decls: [],
      init: [
        {
          kind: 'while',
          cond: constExpr(true),
          doWhile: false,
          body: [
            {
              kind: 'tryFinally',
              body: [call('work')],
              finally: [{ kind: 'break' }],
            },
          ],
        },
      ],
    };
    const [loop] = lowerFinally(
      module,
      createPassContext(() => {}),
    ).init;
    const lowered = loop.kind === 'while' ? loop.body[0] : undefined;
    expect(lowered?.kind).toBe('block');
    expect(lowered?.kind === 'block' && lowered.body).toContainEqual({
      kind: 'break',
    });
  });
});

async function moduleOf(source: string): Promise<string> {
  const { code, diagnostics } = await compileSources({ 'main.ts': source });
  expect(diagnostics).toEqual([]);
  return code['Main_2.hx'];
}

describe('frontend: exceptions', () => {
  it('maps the Error family to ts2hx.Error and its subclasses', async () => {
    const hx = await moduleOf(
      [
        'class AppError extends Error {',
        '  override name = "AppError";',
        '  constructor(message: string, readonly code: number) { super(message); }',
        '  override toString(): string { return `${this.name}!`; }',
        '}',
        'const errors: Error[] = [new RangeError("r"), Error("e"), new AppError("a", 1)];',
        'const first = errors[0];',
        'first.message = "changed";',
        'console.log(first instanceof TypeError, first.toString());',
      ].join('\n'),
    );
    expect(hx).toContain('class AppError extends ts2hx.Error {');
    expect(hx).not.toMatch(/var name:/);
    expect(hx).toContain('this.name = "AppError";');
    expect(hx).toContain('public override function toString():String');
    expect(hx).toContain(
      'errors = [(cast new ts2hx.Error.RangeError("r") : ts2hx.Error), new ts2hx.Error("e"), (cast new Main_2.AppError("a", 1.0) : ts2hx.Error)];',
    );
    expect(hx).toContain('first.message = "changed";');
    expect(hx).toContain('Std.isOfType(first, ts2hx.Error.TypeError)');
    expect(hx).toContain('first.toString()');
  });

  it('binds a catch through ts2hx.Error.caught and leaves finally to the pass', async () => {
    const hx = await moduleOf(
      [
        'try {',
        '  throw 1;',
        '} catch (e) {',
        '  console.log(e);',
        '}',
        'try {',
        '  throw "x";',
        '} catch {',
        '  console.log("no binding");',
        '} finally {',
        '  console.log("finally");',
        '}',
      ].join('\n'),
    );
    expect(hx).toContain('throw 1.0;');
    expect(hx).toContain('} catch (__caught_1:Dynamic) {');
    expect(hx).toContain('var e:Any = ts2hx.Error.caught(__caught_1);');
    expect(hx).toContain('} catch (__caught_2:Dynamic) {');
    expect(hx).not.toContain('caught(__caught_2)');
    expect(hx).toMatch(/var __completion\d+:Int = 0;/);
  });

  it('destructures a catch binding from the caught value', async () => {
    const hx = await moduleOf(
      [
        'try {',
        '  throw new Error("boom");',
        '} catch ({ message }: any) {',
        '  console.log(message);',
        '}',
      ].join('\n'),
    );
    expect(hx).toContain(
      'final __pattern_2:Dynamic = ts2hx.Error.caught(__caught_1);',
    );
    expect(hx).toContain('var message:Dynamic = __pattern_2.message;');
  });

  it('assigns an array length through JsArray.setLength', async () => {
    const hx = await moduleOf('const xs = [1, 2, 3];\nxs.length = 0;');
    expect(hx).toContain('ts2hx.JsArray.setLength(xs, 0.0);');
  });
});
