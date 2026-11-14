import { BOOL, constExpr, FLOAT } from '@src/compiler/ir/builders';
import type { HxExpr, HxModule, HxStmt } from '@src/compiler/ir/types';
import { createPassContext } from '@src/compiler/passes';
import {
  lowerCFor,
  replaceOwnContinues,
} from '@src/compiler/passes/lower-c-for';
import { printStmts } from '@src/compiler/printer/printer';

const local = (name: string): HxExpr => ({ kind: 'local', name, type: FLOAT });
const increment = (name: string): HxExpr => ({
  kind: 'unop',
  op: '++',
  postfix: true,
  operand: local(name),
  type: FLOAT,
});
const lessThan = (name: string, limit: number): HxExpr => ({
  kind: 'binop',
  op: '<',
  left: local(name),
  right: constExpr(limit),
  type: BOOL,
});

function lower(stmt: HxStmt): string {
  const module: HxModule = {
    pack: [],
    name: 'Main',
    sourceFile: 'main.ts',
    imports: [],
    decls: [],
    init: [stmt],
  };
  return printStmts(
    lowerCFor(
      module,
      createPassContext(() => {}),
    ).init,
  );
}

function loop(body: HxStmt[], perIterationBindings: string[] = []): HxStmt {
  return {
    kind: 'cFor',
    init: [
      { kind: 'var', name: 'i', final: false, type: FLOAT, init: constExpr(0) },
    ],
    cond: lessThan('i', 3),
    update: [increment('i')],
    body,
    perIterationBindings,
  };
}

describe('lowerCFor', () => {
  it('runs the update before every continue of its own loop only', () => {
    const inner: HxStmt = {
      kind: 'while',
      cond: constExpr(true),
      body: [{ kind: 'continue' }],
      doWhile: false,
    };
    const lowered = lower(
      loop([
        { kind: 'if', cond: constExpr(true), then: [{ kind: 'continue' }] },
        inner,
      ]),
    );
    expect(lowered).toBe(
      [
        '{',
        '\tvar i:Float = 0.0;',
        '\twhile (i < 3.0) {',
        '\t\tif (true) {',
        '\t\t\ti++;',
        '\t\t\tcontinue;',
        '\t\t}',
        '\t\twhile (true) {',
        '\t\t\tcontinue;',
        '\t\t}',
        '\t\ti++;',
        '\t}',
        '}',
      ].join('\n'),
    );
  });

  it('gives captured loop bindings a fresh copy per iteration', () => {
    const lowered = lower(loop([{ kind: 'continue' }], ['i']));
    expect(lowered).toBe(
      [
        '{',
        '\tvar __i1:Float = 0.0;',
        '\twhile (true) {',
        '\t\tvar i:Float = __i1;',
        '\t\tif (!(i < 3.0)) {',
        '\t\t\tbreak;',
        '\t\t}',
        '\t\t__i1 = i;',
        '\t\t__i1++;',
        '\t\tcontinue;',
        '\t\t__i1 = i;',
        '\t\t__i1++;',
        '\t}',
        '}',
      ].join('\n'),
    );
  });

  it('does not replace continues inside nested functions or loops', () => {
    const nested: HxStmt[] = [
      {
        kind: 'forIn',
        name: 'x',
        iterable: local('xs'),
        body: [{ kind: 'continue' }],
      },
    ];
    expect(replaceOwnContinues(nested, () => [{ kind: 'break' }])).toEqual(
      nested,
    );
  });
});
