import { BOOL, constExpr, FLOAT, STRING } from '@src/compiler/ir/builders';
import type {
  HxExpr,
  HxFunction,
  HxModule,
  HxStmt,
} from '@src/compiler/ir/types';
import { createPassContext, runPasses } from '@src/compiler/passes';
import {
  hasJumpTo,
  lowerControlFlow,
} from '@src/compiler/passes/lower-control-flow';
import { printStmts } from '@src/compiler/printer/printer';

import { compileSources } from './helpers';

const local = (name: string): HxExpr => ({ kind: 'local', name, type: FLOAT });
const is = (value: number): HxExpr => ({
  kind: 'binop',
  op: '==',
  left: local('s'),
  right: constExpr(value),
  type: BOOL,
});
const call = (name: string): HxStmt => ({
  kind: 'expr',
  expr: {
    kind: 'call',
    callee: { kind: 'local', name, type: { kind: 'dynamic' } },
    args: [],
    type: { kind: 'dynamic' },
  },
});
const whileTrue = (body: HxStmt[]): HxStmt => ({
  kind: 'while',
  cond: constExpr(true),
  body,
  doWhile: false,
});

function moduleOf(init: HxStmt[], fn?: HxFunction): HxModule {
  return {
    pack: [],
    name: 'Main',
    sourceFile: 'main.ts',
    imports: [],
    decls: fn ? [{ kind: 'moduleFunction', name: 'f', fn }] : [],
    init,
  };
}

function lower(stmts: HxStmt[]): string {
  return printStmts(
    lowerControlFlow(
      moduleOf(stmts),
      createPassContext(() => {}),
    ).init,
  );
}

function lines(...text: string[]): string {
  return text.join('\n');
}

describe('lowerControlFlow', () => {
  it('turns a switch without fall-through into an if-chain, default last', () => {
    expect(
      lower([
        {
          kind: 'tsSwitch',
          subject: { name: 's', value: local('x') },
          clauses: [
            { test: is(1), body: [] },
            { test: is(2), body: [call('a'), { kind: 'break' }] },
            { body: [call('d'), { kind: 'break' }] },
            {
              test: is(3),
              body: [{ kind: 'block', body: [call('c'), { kind: 'break' }] }],
            },
          ],
        },
      ]),
    ).toBe(
      lines(
        '{',
        '\tfinal s:Float = x;',
        '\tif (s == 1.0 || s == 2.0) {',
        '\t\ta();',
        '\t} else if (s == 3.0) {',
        '\t\t{',
        '\t\t\tc();',
        '\t\t}',
        '\t} else {',
        '\t\td();',
        '\t}',
        '}',
      ),
    );
  });

  it('runs bodies from the matched clause on when clauses fall through', () => {
    expect(
      lower([
        {
          kind: 'tsSwitch',
          clauses: [
            { test: is(1), body: [call('a')] },
            { body: [call('d')] },
            { test: is(2), body: [call('b'), { kind: 'break' }] },
          ],
        },
      ]),
    ).toBe(
      lines(
        '{',
        '\tdo {',
        '\t\tfinal __case1:Int = s == 1.0 ? 0 : s == 2.0 ? 2 : 1;',
        '\t\tif (__case1 <= 0) {',
        '\t\t\ta();',
        '\t\t}',
        '\t\tif (__case1 <= 1) {',
        '\t\t\td();',
        '\t\t}',
        '\t\tif (__case1 <= 2) {',
        '\t\t\tb();',
        '\t\t\tbreak;',
        '\t\t}',
        '\t} while (false);',
        '}',
      ),
    );
  });

  it('keeps tests in order when the default clause has a side-effecting test', () => {
    const effectful: HxExpr = {
      kind: 'call',
      callee: local('probe'),
      args: [],
      type: BOOL,
    };
    const out = lower([
      {
        kind: 'tsSwitch',
        clauses: [
          { test: effectful, body: [] },
          { body: [call('d'), { kind: 'break' }] },
          { test: is(2), body: [call('b')] },
        ],
      },
    ]);
    expect(out).toContain(
      'final __case1:Int = probe() ? 0 : s == 2.0 ? 1 : 0;',
    );
  });

  it('continues the loop through a flag from a switch wrapped for its break', () => {
    const out = lower([
      whileTrue([
        {
          kind: 'tsSwitch',
          clauses: [
            {
              test: is(1),
              body: [
                {
                  kind: 'if',
                  cond: local('c'),
                  then: [{ kind: 'break' }],
                },
                { kind: 'continue' },
              ],
            },
          ],
        },
        call('after'),
      ]),
    ]);
    expect(out).toBe(
      lines(
        'var __continue1:Bool = false;',
        'while (true) {',
        '\t{',
        '\t\tdo {',
        '\t\t\tif (s == 1.0) {',
        '\t\t\t\tif (c) {',
        '\t\t\t\t\tbreak;',
        '\t\t\t\t}',
        '\t\t\t\t__continue1 = true;',
        '\t\t\t\tbreak;',
        '\t\t\t}',
        '\t\t} while (false);',
        '\t\tif (__continue1) {',
        '\t\t\t__continue1 = false;',
        '\t\t\tcontinue;',
        '\t\t}',
        '\t}',
        '\tafter();',
        '}',
      ),
    );
  });

  it('breaks out of nested loops to a label through one flag checked after each loop', () => {
    const out = lower([
      {
        kind: 'labeled',
        label: 'outer',
        body: whileTrue([
          whileTrue([whileTrue([{ kind: 'labeledBreak', label: 'outer' }])]),
          call('x'),
        ]),
      },
    ]);
    expect(out).toBe(
      lines(
        'var __break1:Bool = false;',
        'while (true) {',
        '\twhile (true) {',
        '\t\twhile (true) {',
        '\t\t\t__break1 = true;',
        '\t\t\tbreak;',
        '\t\t}',
        '\t\tif (__break1) {',
        '\t\t\tbreak;',
        '\t\t}',
        '\t}',
        '\tif (__break1) {',
        '\t\tbreak;',
        '\t}',
        '\tx();',
        '}',
      ),
    );
  });

  it('wraps a labelled block only when something breaks it', () => {
    expect(
      lower([
        {
          kind: 'labeled',
          label: 'b',
          body: {
            kind: 'block',
            body: [{ kind: 'labeledBreak', label: 'b' }, call('x')],
          },
        },
        { kind: 'labeled', label: 'c', body: call('y') },
      ]),
    ).toBe(
      lines(
        'do {',
        '\t{',
        '\t\tbreak;',
        '\t\tx();',
        '\t}',
        '} while (false);',
        'y();',
      ),
    );
  });

  it('attaches stacked labels to the loop they label', () => {
    const out = lower([
      {
        kind: 'labeled',
        label: 'a',
        body: {
          kind: 'labeled',
          label: 'b',
          body: whileTrue([{ kind: 'labeledContinue', label: 'a' }]),
        },
      },
    ]);
    expect(out).toBe(lines('while (true) {', '\tcontinue;', '}'));
  });

  it('lets lowerCFor run the update of a loop continued through a flag', () => {
    const module = moduleOf([
      {
        kind: 'labeled',
        label: 'rows',
        body: {
          kind: 'cFor',
          init: [],
          update: [
            {
              kind: 'unop',
              op: '++',
              postfix: true,
              operand: local('i'),
              type: FLOAT,
            },
          ],
          body: [whileTrue([{ kind: 'labeledContinue', label: 'rows' }])],
          perIterationBindings: [],
        },
      },
    ]);
    const out = printStmts(
      runPasses(
        module,
        createPassContext(() => {}),
      ).init,
    );
    expect(out).toContain(
      lines(
        '\t\tif (__continue1) {',
        '\t\t\t__continue1 = false;',
        '\t\t\ti++;',
        '\t\t\tcontinue;',
      ),
    );
  });

  it('ends a value function whose lowered switch Haxe sees falling through', () => {
    const fn: HxFunction = {
      typeParams: [],
      params: [],
      ret: STRING,
      body: [
        {
          kind: 'tsSwitch',
          clauses: [
            { test: is(1), body: [call('a')] },
            { body: [{ kind: 'return', value: constExpr('x') }] },
          ],
        },
      ],
    };
    const lowered = lowerControlFlow(
      moduleOf([], fn),
      createPassContext(() => {}),
    );
    const decl = lowered.decls[0];
    expect(decl.kind === 'moduleFunction' && decl.fn.body?.at(-1)).toEqual({
      kind: 'throw',
      value: constExpr('unreachable'),
    });
  });

  it('lowers function expressions with their own jump scopes', () => {
    const inner: HxExpr = {
      kind: 'fn',
      fn: {
        typeParams: [],
        params: [],
        ret: {
          kind: 'path',
          path: { pack: [], module: 'Void', name: 'Void' },
          params: [],
        },
        body: [
          {
            kind: 'labeled',
            label: 'l',
            body: whileTrue([{ kind: 'labeledBreak', label: 'l' }]),
          },
        ],
      },
      type: { kind: 'dynamic' },
    };
    const out = lower([{ kind: 'expr', expr: inner }]);
    expect(out).not.toContain('labeled');
    expect(out).toContain('break;');
  });

  it('finds the jumps a scope owns, not those of nested loops or switches', () => {
    const owner = {
      labels: new Set(['l']),
      plainBreak: true,
      plainContinue: false,
    };
    expect(hasJumpTo([whileTrue([{ kind: 'break' }])], owner)).toBe(false);
    expect(
      hasJumpTo(
        [{ kind: 'tsSwitch', clauses: [{ body: [{ kind: 'break' }] }] }],
        owner,
      ),
    ).toBe(false);
    expect(
      hasJumpTo([whileTrue([{ kind: 'labeledBreak', label: 'l' }])], owner),
    ).toBe(true);
    expect(
      hasJumpTo(
        [{ kind: 'if', cond: local('c'), then: [{ kind: 'break' }] }],
        owner,
      ),
    ).toBe(true);
    expect(hasJumpTo([{ kind: 'continue' }], owner)).toBe(false);
  });
});

describe('frontend: switch, labels, void and assignment expressions', () => {
  async function moduleText(source: string) {
    const { code, diagnostics } = await compileSources({ 'main.ts': source });
    return { hx: code['Main_2.hx'], diagnostics };
  }

  it('reads the subject once and tests clauses with ===', async () => {
    const { hx, diagnostics } = await moduleText(
      [
        'function f(): number { return 1; }',
        "switch (f()) { case 1: console.log('one'); break; default: console.log('other'); }",
      ].join('\n'),
    );
    expect(diagnostics).toEqual([]);
    expect(hx).toMatch(
      /final __switch_1:Float = f\(\);\s*if \(__switch_1 == 1\.0\) \{\s*ts2hx\.Console\.log\("one"\);\s*\} else \{/,
    );
  });

  it('rejects a let/const shared between switch clauses', async () => {
    const { hx, diagnostics } = await moduleText(
      'const n: number = 1;\nswitch (n) { case 0: let v = 1; case 1: v = 2; console.log(v); }',
    );
    expect(diagnostics.map((d) => d.message)).toEqual([
      'TODO(ts2hx): a let/const shared between switch clauses is not supported yet',
    ]);
    expect(hx).toContain('ts2hx.Ts2hx.unsupported(');
  });

  it('turns void into undefined, keeping the side effect', async () => {
    const { hx, diagnostics } = await moduleText(
      'function g(): number { return 1; }\nconst a = void 0;\nconst b = void g();',
    );
    expect(diagnostics).toEqual([]);
    expect(hx).toContain('a = null;');
    expect(hx).toMatch(/b = \{\s*g\(\);\s*null;\s*\};/);
  });

  it('spells a compound assignment to a module var as a plain one', async () => {
    const { hx, diagnostics } = await moduleText(
      [
        'let m = 2;',
        "let s = 'a';",
        'const d = (m *= 3);',
        "const t = (s += 'b');",
        'function f(x: number): number { let y = x; return (y += 1); }',
      ].join('\n'),
    );
    expect(diagnostics).toEqual([]);
    expect(hx).toContain('d = m = m * 3.0;');
    expect(hx).toContain('t = s = s + "b";');
    expect(hx).toContain('return y += 1.0;');
  });
});
