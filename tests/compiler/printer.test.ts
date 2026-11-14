import {
  BOOL,
  constExpr,
  DYNAMIC,
  FLOAT,
  STRING,
  typePath,
  unsupportedExpr,
  VOID,
} from '@src/compiler/ir/builders';
import type { HxExpr, HxModule } from '@src/compiler/ir/types';
import {
  printDecl,
  printExpr,
  printFloat,
  printModule,
  printStmts,
  printString,
  printType,
  PrinterError,
} from '@src/compiler/printer/printer';

const local = (name: string): HxExpr => ({ kind: 'local', name, type: FLOAT });
const bin = (
  op: Extract<HxExpr, { kind: 'binop' }>['op'],
  left: HxExpr,
  right: HxExpr,
): HxExpr => ({ kind: 'binop', op, left, right, type: FLOAT });
const neg = (operand: HxExpr): HxExpr => ({
  kind: 'unop',
  op: '-',
  postfix: false,
  operand,
  type: FLOAT,
});

describe('printer', () => {
  describe('literals', () => {
    it.each([
      [0.1, '0.1'],
      [5, '5.0'],
      [1e21, '1.0e+21'],
      [1e-7, '1.0e-7'],
      [1.5e-10, '1.5e-10'],
      [123456789012345680000, '123456789012345680000.0'],
      [-0, '-0.0'],
      [NaN, 'Math.NaN'],
      [Infinity, 'Math.POSITIVE_INFINITY'],
      [-Infinity, 'Math.NEGATIVE_INFINITY'],
    ])('prints the number %p as %s', (value, expected) => {
      expect(printFloat(value)).toBe(expected);
    });

    it('prints Int constants without a fraction', () => {
      expect(
        printExpr({ kind: 'const', value: 3, int: true, type: FLOAT }),
      ).toBe('3');
    });

    it('escapes strings and never interpolates', () => {
      expect(printString('a"b\\c\n\t$x \u0001 é😀')).toBe(
        '"a\\"b\\\\c\\n\\t$x \\x01 é😀"',
      );
    });

    it('refuses lone surrogates', () => {
      expect(() => printString('\ud800')).toThrow(PrinterError);
    });
  });

  describe('precedence', () => {
    const [a, b, c] = ['a', 'b', 'c'].map(local);

    it.each<[HxExpr, string]>([
      [bin('*', bin('+', a, b), c), '(a + b) * c'],
      [bin('+', bin('*', a, b), c), 'a * b + c'],
      [bin('-', a, bin('-', b, c)), 'a - (b - c)'],
      [bin('-', bin('-', a, b), c), 'a - b - c'],
      [bin('%', bin('*', a, b), c), '(a * b) % c'],
      [bin('|', a, bin('&', b, c)), 'a | (b & c)'],
      [bin('==', bin('==', a, b), c), '(a == b) == c'],
      [neg(neg(a)), '-(-a)'],
      [neg(constExpr(-0)), '-(-0.0)'],
      [bin('*', neg(a), b), '-a * b'],
      [
        {
          kind: 'field',
          target: bin('+', a, b),
          name: 'length',
          type: FLOAT,
        },
        '(a + b).length',
      ],
      [
        {
          kind: 'ternary',
          cond: a,
          then: b,
          else: { kind: 'ternary', cond: b, then: c, else: a, type: FLOAT },
          type: FLOAT,
        },
        'a ? b : b ? c : a',
      ],
    ])('prints %#', (expr, expected) => {
      expect(printExpr(expr)).toBe(expected);
    });
  });

  it('prints calls, casts and runtime paths', () => {
    const call: HxExpr = {
      kind: 'call',
      callee: {
        kind: 'staticField',
        owner: typePath(['ts2hx'], 'Console'),
        name: 'log',
        type: DYNAMIC,
      },
      args: [constExpr('x'), local('rest')],
      spreadLast: true,
      type: VOID,
    };
    expect(printExpr(call)).toBe('ts2hx.Console.log("x", ...rest)');
    expect(
      printExpr({
        kind: 'cast',
        expr: local('a'),
        checked: false,
        type: STRING,
      }),
    ).toBe('(cast a : String)');
    expect(
      printExpr({
        kind: 'moduleField',
        module: typePath(['app'], 'Util'),
        name: 'f',
        type: DYNAMIC,
      }),
    ).toBe('app.Util.f');
  });

  it('prints an unsupported expression as a TODO comment plus a throwing call', () => {
    const expr = unsupportedExpr('X is not supported yet', 'a */ b');
    expect(printExpr(expr)).toBe(
      '/* TODO(ts2hx): X is not supported yet: a * / b */ ts2hx.Ts2hx.unsupported("X is not supported yet")',
    );
    expect(printStmts([{ kind: 'expr', expr }])).toBe(
      '// TODO(ts2hx): X is not supported yet: a * / b\nts2hx.Ts2hx.unsupported("X is not supported yet");',
    );
  });

  it('prints types', () => {
    expect(
      printType({
        kind: 'fn',
        args: [
          { name: 'a', type: FLOAT },
          { name: 'b', type: STRING, optional: true },
          { name: 'r', type: BOOL, rest: true },
        ],
        ret: VOID,
      }),
    ).toBe('(a:Float, ?b:String, r:haxe.Rest<Bool>) -> Void');
    expect(
      printType({
        kind: 'anon',
        fields: [
          { name: 'x', type: FLOAT, readonly: true },
          { name: 'y', type: { kind: 'null', inner: STRING }, optional: true },
          {
            name: 'f',
            type: { kind: 'fn', args: [{ name: 'v', type: FLOAT }], ret: VOID },
            method: true,
          },
        ],
      }),
    ).toBe(
      '{ final x:Float; @:optional var y:Null<String>; function f(v:Float):Void; }',
    );
    expect(
      printType({
        kind: 'path',
        path: { pack: ['a'], module: 'M', name: 'T' },
        params: [DYNAMIC],
      }),
    ).toBe('a.M.T<Dynamic>');
  });

  it('prints control flow', () => {
    expect(
      printStmts([
        {
          kind: 'if',
          cond: local('a'),
          then: [{ kind: 'break' }],
          else: [
            {
              kind: 'if',
              cond: local('b'),
              then: [{ kind: 'continue' }],
              else: [{ kind: 'return' }],
            },
          ],
        },
        {
          kind: 'switch',
          subject: local('a'),
          cases: [{ values: [constExpr(1), constExpr(2)], body: [] }],
          default: [{ kind: 'throw', value: constExpr('x') }],
        },
        {
          kind: 'while',
          cond: constExpr(true),
          body: [
            {
              kind: 'var',
              name: 'i',
              final: true,
              type: FLOAT,
              init: constExpr(0),
            },
          ],
          doWhile: true,
        },
      ]),
    ).toMatchSnapshot();
  });

  it('refuses statements a pass has to lower', () => {
    expect(() =>
      printStmts([{ kind: 'labeledBreak', label: 'outer' }]),
    ).toThrow(PrinterError);
  });

  it('prints declarations', () => {
    expect(
      printDecl({
        kind: 'class',
        name: 'Shape',
        typeParams: [{ name: 'T', constraints: [STRING] }],
        isAbstract: true,
        superClass: { path: typePath(['geo'], 'Base'), params: [] },
        meta: ['@:keep'],
        fields: [
          {
            kind: 'var',
            name: 'count',
            access: 'public',
            isStatic: true,
            final: false,
            type: FLOAT,
            init: constExpr(0),
          },
          {
            kind: 'property',
            name: 'area',
            access: 'public',
            isStatic: false,
            get: 'get',
            set: 'never',
            isVar: false,
            type: FLOAT,
          },
          {
            kind: 'method',
            name: 'describe',
            access: 'public',
            isStatic: false,
            isOverride: false,
            isAbstract: true,
            fn: { typeParams: [], params: [], ret: STRING },
          },
          {
            kind: 'method',
            name: 'scale',
            access: 'private',
            isStatic: false,
            isOverride: true,
            isAbstract: false,
            fn: {
              typeParams: [],
              params: [
                { name: 'by', type: FLOAT, defaultValue: constExpr(1) },
                { name: 'rest', type: FLOAT, rest: true },
              ],
              ret: VOID,
              body: [{ kind: 'comment', text: 'scaled', todo: true }],
            },
          },
        ],
      }),
    ).toMatchSnapshot();
    expect(
      printDecl({
        kind: 'enumAbstract',
        name: 'Color',
        underlying: STRING,
        members: [{ name: 'Red', value: constExpr('red') }],
      }),
    ).toBe('enum abstract Color(String) {\n\tvar Red = "red";\n}');
    expect(
      printDecl({
        kind: 'moduleVar',
        name: 'x',
        final: true,
        type: FLOAT,
        init: constExpr(2),
      }),
    ).toBe('final x:Float = 2.0;');
  });

  it('prints a module with its package and init function', () => {
    const module: HxModule = {
      pack: ['cases', 'basics', 'hello'],
      name: 'Hello',
      sourceFile: 'hello.ts',
      imports: [],
      decls: [],
      init: [],
    };
    expect(printModule(module)).toBe(
      'package cases.basics.hello;\n\nfunction __init():Void {}\n',
    );
  });
});
