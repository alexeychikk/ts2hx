import ts from 'typescript';

import {
  BOOL,
  constExpr,
  DYNAMIC,
  FLOAT,
  INT,
  isBoolType,
  isStringType,
  localExpr,
  RUNTIME,
  sameType,
  staticCall,
  STRING,
  unsupportedExpr,
  VOID,
} from '../ir/builders';
import type {
  HxAssignOp,
  HxBinop,
  HxDecl,
  HxExpr,
  HxFunction,
  HxModule,
  HxParam,
  HxStmt,
  HxType,
  HxTypeParam,
  SourcePos,
} from '../ir/types';
import type { ModuleInfo, ProjectModel } from '../model/project-model';
import { escapeIdentifier } from '../model/names';
import {
  type BoundReceiver,
  CALL_BINDINGS,
  PROPERTY_BINDINGS,
  stdlibKey,
  VALUE_BINDINGS,
} from '../stdlib/bindings';
import { isNullable, nullable, TypeMapper } from './types';

export interface UnsupportedReport {
  message: string;
  pos?: SourcePos;
}

const FLOAT_OPERATORS: ReadonlyMap<ts.SyntaxKind, HxBinop> = new Map([
  [ts.SyntaxKind.PlusToken, '+'],
  [ts.SyntaxKind.MinusToken, '-'],
  [ts.SyntaxKind.AsteriskToken, '*'],
  [ts.SyntaxKind.SlashToken, '/'],
  [ts.SyntaxKind.PercentToken, '%'],
]);

const INT32_OPERATORS: ReadonlyMap<ts.SyntaxKind, HxBinop> = new Map([
  [ts.SyntaxKind.AmpersandToken, '&'],
  [ts.SyntaxKind.BarToken, '|'],
  [ts.SyntaxKind.CaretToken, '^'],
]);

/** Operators computed by a `ts2hx.Num` function. */
const NUM_OPERATORS: ReadonlyMap<ts.SyntaxKind, string> = new Map([
  [ts.SyntaxKind.AsteriskAsteriskToken, 'pow'],
  [ts.SyntaxKind.LessThanLessThanToken, 'shl'],
  [ts.SyntaxKind.GreaterThanGreaterThanToken, 'shr'],
  [ts.SyntaxKind.GreaterThanGreaterThanGreaterThanToken, 'ushr'],
]);

const COMPARISON_OPERATORS: ReadonlyMap<ts.SyntaxKind, HxBinop> = new Map([
  [ts.SyntaxKind.LessThanToken, '<'],
  [ts.SyntaxKind.LessThanEqualsToken, '<='],
  [ts.SyntaxKind.GreaterThanToken, '>'],
  [ts.SyntaxKind.GreaterThanEqualsToken, '>='],
]);

/** Compound assignments and the binary operator they apply. */
const COMPOUND_ASSIGNMENTS: ReadonlyMap<ts.SyntaxKind, ts.BinaryOperator> =
  new Map([
    [ts.SyntaxKind.PlusEqualsToken, ts.SyntaxKind.PlusToken],
    [ts.SyntaxKind.MinusEqualsToken, ts.SyntaxKind.MinusToken],
    [ts.SyntaxKind.AsteriskEqualsToken, ts.SyntaxKind.AsteriskToken],
    [ts.SyntaxKind.SlashEqualsToken, ts.SyntaxKind.SlashToken],
    [ts.SyntaxKind.PercentEqualsToken, ts.SyntaxKind.PercentToken],
    [
      ts.SyntaxKind.AsteriskAsteriskEqualsToken,
      ts.SyntaxKind.AsteriskAsteriskToken,
    ],
    [ts.SyntaxKind.AmpersandEqualsToken, ts.SyntaxKind.AmpersandToken],
    [ts.SyntaxKind.BarEqualsToken, ts.SyntaxKind.BarToken],
    [ts.SyntaxKind.CaretEqualsToken, ts.SyntaxKind.CaretToken],
    [
      ts.SyntaxKind.LessThanLessThanEqualsToken,
      ts.SyntaxKind.LessThanLessThanToken,
    ],
    [
      ts.SyntaxKind.GreaterThanGreaterThanEqualsToken,
      ts.SyntaxKind.GreaterThanGreaterThanToken,
    ],
    [
      ts.SyntaxKind.GreaterThanGreaterThanGreaterThanEqualsToken,
      ts.SyntaxKind.GreaterThanGreaterThanGreaterThanToken,
    ],
  ]);

const NULLISH_FLAGS =
  ts.TypeFlags.Null | ts.TypeFlags.Undefined | ts.TypeFlags.Void;
const OBJECT_FLAGS = ts.TypeFlags.Object | ts.TypeFlags.NonPrimitive;

const MAX_SOURCE_SNIPPET = 80;

const SYNTAX_KIND_NAMES: ReadonlyMap<ts.SyntaxKind, string> = (() => {
  const names = new Map<ts.SyntaxKind, string>();
  for (const [name, value] of Object.entries(ts.SyntaxKind)) {
    if (typeof value === 'number' && !/^(First|Last)/.test(name)) {
      names.set(value, name);
    }
  }
  return names;
})();

/** `SyntaxKind` name without the `FirstX`/`LastX` range aliases. */
export function syntaxKindName(kind: ts.SyntaxKind): string {
  return SYNTAX_KIND_NAMES.get(kind) ?? String(kind);
}

/** First line of a node's source, shortened: context for TODO comments, never emitted as code. */
function sourceSnippet(node: ts.Node): string {
  const firstLine = node.getText().split(/\r?\n/)[0].trim();
  return firstLine.length > MAX_SOURCE_SNIPPET
    ? `${firstLine.slice(0, MAX_SOURCE_SNIPPET)}…`
    : firstLine;
}

function constituents(type: ts.Type): readonly ts.Type[] {
  return type.isUnion() ? type.types : [type];
}

function everyConstituent(type: ts.Type, flags: ts.TypeFlags): boolean {
  return constituents(type).every((t) => (t.flags & flags) !== 0);
}

/** Expressions that can be read twice without repeating a side effect. */
function isPure(expr: HxExpr): boolean {
  switch (expr.kind) {
    case 'const':
    case 'local':
    case 'staticField':
    case 'fn':
      return true;
    case 'arrayLit':
      return expr.elements.every(isPure);
    case 'objectLit':
      return expr.fields.every((f) => isPure(f.value));
    default:
      return false;
  }
}

function isVarDeclarationList(list: ts.VariableDeclarationList): boolean {
  return (list.flags & ts.NodeFlags.BlockScoped) === 0;
}

function isFunctionLike(node: ts.Node): boolean {
  return (
    ts.isFunctionDeclaration(node) ||
    ts.isFunctionExpression(node) ||
    ts.isArrowFunction(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isConstructorDeclaration(node) ||
    ts.isAccessor(node) ||
    ts.isClassLike(node)
  );
}

type FunctionNode =
  | ts.FunctionDeclaration
  | ts.FunctionExpression
  | ts.ArrowFunction
  | ts.MethodDeclaration;

/** Converts one TS source file into a Haxe IR module (ADR 0001, Frontend). */
export class ModuleFrontend {
  private readonly checker: ts.TypeChecker;
  private readonly sourceFile: ts.SourceFile;
  private readonly types: TypeMapper;
  /** `var`s and module-level bindings: declared up front, so their declarations only assign. */
  private readonly hoisted = new Set<ts.Symbol>();
  private tempCounter = 0;

  constructor(
    private readonly model: ProjectModel,
    private readonly info: ModuleInfo,
    private readonly report: (unsupported: UnsupportedReport) => void,
  ) {
    this.checker = model.checker;
    this.sourceFile = info.sourceFile;
    this.types = new TypeMapper(this.checker);
  }

  convert(): HxModule {
    const decls: HxDecl[] = [];
    for (const declaration of this.varDeclarations(
      this.sourceFile.statements,
      true,
    )) {
      const symbol = this.checker.getSymbolAtLocation(declaration.name)!;
      this.hoisted.add(symbol);
      decls.push({
        kind: 'moduleVar',
        name: escapeIdentifier(symbol.name),
        final: false,
        type: this.declaredType(declaration),
      });
    }
    const init: HxStmt[] = [];
    for (const statement of this.sourceFile.statements) {
      if (ts.isFunctionDeclaration(statement) && statement.name) {
        if (!statement.body) continue;
        decls.push({
          kind: 'moduleFunction',
          name: escapeIdentifier(statement.name.text),
          fn: this.function(statement),
        });
      } else {
        init.push(...this.statement(statement));
      }
    }
    return {
      pack: this.info.path.pack,
      name: this.info.path.module,
      sourceFile: this.sourceFile.fileName,
      imports: [],
      decls,
      init,
    };
  }

  private freshName(hint: string): string {
    return `__${hint}_${++this.tempCounter}`;
  }

  private pos(node: ts.Node): SourcePos {
    const { line, character } = this.sourceFile.getLineAndCharacterOfPosition(
      node.getStart(this.sourceFile),
    );
    return {
      file: this.sourceFile.fileName,
      line: line + 1,
      column: character + 1,
    };
  }

  private unsupported(node: ts.Node, message?: string): HxExpr {
    const text = message ?? `${syntaxKindName(node.kind)} is not supported yet`;
    const pos = this.pos(node);
    this.report({ message: text, pos });
    return unsupportedExpr(text, sourceSnippet(node), pos);
  }

  private unsupportedStmt(node: ts.Node, message?: string): HxStmt[] {
    return [{ kind: 'expr', expr: this.unsupported(node, message) }];
  }

  // ---------------------------------------------------------------- types

  private typeOf(node: ts.Node): ts.Type {
    return this.checker.getTypeAtLocation(node);
  }

  private hxTypeOf(node: ts.Node): HxType {
    return this.types.map(this.typeOf(node));
  }

  /** Haxe type of a declared binding; a hoisted `var` may be read before it is assigned. */
  private declaredType(declaration: ts.VariableDeclaration): HxType {
    const symbol = this.checker.getSymbolAtLocation(declaration.name);
    const type = symbol
      ? this.types.map(this.checker.getTypeOfSymbol(symbol))
      : DYNAMIC;
    return isVarDeclarationList(
      declaration.parent as ts.VariableDeclarationList,
    )
      ? nullable(type)
      : type;
  }

  private isStringLike(node: ts.Expression): boolean {
    return everyConstituent(this.typeOf(node), ts.TypeFlags.StringLike);
  }

  private isNumberLike(node: ts.Expression): boolean {
    return everyConstituent(this.typeOf(node), ts.TypeFlags.NumberLike);
  }

  private isBooleanLike(node: ts.Expression): boolean {
    return everyConstituent(this.typeOf(node), ts.TypeFlags.BooleanLike);
  }

  /** `value` typed as `type`, through `Dynamic` when Haxe would not unify them. */
  private coerce(value: HxExpr, type: HxType): HxExpr {
    if (this.unifies(value.type, type)) {
      return value;
    }
    return { kind: 'cast', expr: value, checked: false, type };
  }

  private unifies(from: HxType, to: HxType): boolean {
    if (
      sameType(from, to) ||
      to.kind === 'dynamic' ||
      from.kind === 'dynamic'
    ) {
      return true;
    }
    if (to.kind === 'null') return this.unifies(from, to.inner);
    if (from.kind === 'null') return this.unifies(from.inner, to);
    if (
      to.kind === 'path' &&
      to.path.name === 'Float' &&
      from.kind === 'path'
    ) {
      return from.path.name === 'Int';
    }
    return (
      (from.kind === 'fn' && to.kind === 'fn') ||
      (from.kind === 'anon' && to.kind === 'anon') ||
      (from.kind === 'path' &&
        to.kind === 'path' &&
        from.path.name === 'Array' &&
        to.path.name === 'Array')
    );
  }

  /** `value` as one alternative of a `?:` or `||` typed `type`: Haxe unifies the branches, so a `Dynamic` result casts each. */
  private branch(value: HxExpr, type: HxType): HxExpr {
    return type.kind === 'dynamic' && value.type.kind !== 'dynamic'
      ? { kind: 'cast', expr: value, checked: false, type }
      : this.coerce(value, type);
  }

  /** The common Haxe type of alternative values (`?:`, `||`): `Dynamic` when they differ. */
  private joinTypes(expected: HxType, values: HxExpr[]): HxType {
    return values.every((v) => this.unifies(v.type, expected))
      ? expected
      : DYNAMIC;
  }

  // ----------------------------------------------------------- statements

  /** `var` declarations scoped to a function (or the module), not inside nested functions. */
  private varDeclarations(
    statements: readonly ts.Statement[],
    moduleLevel: boolean,
  ): ts.VariableDeclaration[] {
    const result: ts.VariableDeclaration[] = [];
    const visit = (node: ts.Node, topLevel: boolean): void => {
      if (isFunctionLike(node)) {
        return;
      }
      if (ts.isVariableDeclarationList(node)) {
        if (isVarDeclarationList(node) || (moduleLevel && topLevel)) {
          result.push(
            ...node.declarations.filter((d) => ts.isIdentifier(d.name)),
          );
        }
      }
      ts.forEachChild(node, (child) =>
        visit(child, topLevel && ts.isVariableStatement(node)),
      );
    };
    for (const statement of statements) {
      visit(statement, true);
    }
    return result;
  }

  private block(statements: readonly ts.Statement[]): HxStmt[] {
    const functions = statements.filter(ts.isFunctionDeclaration);
    const others = statements.filter((s) => !ts.isFunctionDeclaration(s));
    return [...functions, ...others].flatMap((s) => this.statement(s));
  }

  private body(statement: ts.Statement): HxStmt[] {
    return ts.isBlock(statement)
      ? this.block(statement.statements)
      : this.statement(statement);
  }

  private statement(node: ts.Statement): HxStmt[] {
    if (ts.isExpressionStatement(node)) {
      return [{ kind: 'expr', expr: this.expression(node.expression) }];
    }
    if (
      ts.isEmptyStatement(node) ||
      ts.isImportDeclaration(node) ||
      ts.isExportDeclaration(node) ||
      ts.isInterfaceDeclaration(node) ||
      ts.isTypeAliasDeclaration(node)
    ) {
      return [];
    }
    if (ts.isVariableStatement(node)) {
      return this.variableList(node.declarationList);
    }
    if (ts.isFunctionDeclaration(node)) {
      return node.name && node.body
        ? [
            {
              kind: 'localFunction',
              name: escapeIdentifier(node.name.text),
              fn: this.function(node),
            },
          ]
        : [];
    }
    if (ts.isBlock(node)) {
      return [{ kind: 'block', body: this.block(node.statements) }];
    }
    if (ts.isIfStatement(node)) {
      return [
        {
          kind: 'if',
          cond: this.condition(node.expression),
          then: this.body(node.thenStatement),
          else: node.elseStatement && this.body(node.elseStatement),
        },
      ];
    }
    if (ts.isWhileStatement(node) || ts.isDoStatement(node)) {
      return [
        {
          kind: 'while',
          cond: this.condition(node.expression),
          body: this.body(node.statement),
          doWhile: ts.isDoStatement(node),
        },
      ];
    }
    if (ts.isForStatement(node)) {
      return this.forStatement(node);
    }
    if (ts.isForOfStatement(node)) {
      return this.forOf(node);
    }
    if (ts.isReturnStatement(node)) {
      return [
        {
          kind: 'return',
          value: node.expression && this.expression(node.expression),
        },
      ];
    }
    if (ts.isBreakStatement(node) && !node.label) {
      return [{ kind: 'break' }];
    }
    if (ts.isContinueStatement(node) && !node.label) {
      return [{ kind: 'continue' }];
    }
    return this.unsupportedStmt(node);
  }

  private variableList(list: ts.VariableDeclarationList): HxStmt[] {
    const isConst = (list.flags & ts.NodeFlags.Const) !== 0;
    return list.declarations.flatMap((declaration): HxStmt[] => {
      if (!ts.isIdentifier(declaration.name)) {
        return this.unsupportedStmt(
          declaration,
          'destructuring declarations are not supported yet',
        );
      }
      const symbol = this.checker.getSymbolAtLocation(declaration.name)!;
      const name = escapeIdentifier(declaration.name.text);
      const type = this.declaredType(declaration);
      const init =
        declaration.initializer &&
        this.coerce(this.expression(declaration.initializer), type);
      if (this.hoisted.has(symbol)) {
        return init
          ? [
              {
                kind: 'expr',
                expr: {
                  kind: 'assign',
                  op: '=',
                  target: localExpr(name, type),
                  value: init,
                  type,
                },
              },
            ]
          : [];
      }
      if (
        init &&
        declaration.initializer &&
        this.refersTo(declaration.initializer, symbol)
      ) {
        return [
          { kind: 'var', name, final: false, type, init: constExpr(null) },
          {
            kind: 'expr',
            expr: {
              kind: 'assign',
              op: '=',
              target: localExpr(name, type),
              value: init,
              type,
            },
          },
        ];
      }
      return [
        {
          kind: 'var',
          name,
          final: isConst,
          type,
          init: init ?? (isNullable(type) ? constExpr(null) : undefined),
        },
      ];
    });
  }

  /** Whether `node` reads `symbol`, optionally only from inside a nested function. */
  private refersTo(
    node: ts.Node,
    symbol: ts.Symbol,
    onlyInFunctions = false,
  ): boolean {
    const visit = (child: ts.Node, inFunction: boolean): boolean => {
      if (
        ts.isIdentifier(child) &&
        (inFunction || !onlyInFunctions) &&
        this.checker.getSymbolAtLocation(child) === symbol
      ) {
        return true;
      }
      const nested = inFunction || isFunctionLike(child);
      return ts.forEachChild(child, (c) => visit(c, nested)) ?? false;
    };
    return visit(node, isFunctionLike(node));
  }

  private forStatement(node: ts.ForStatement): HxStmt[] {
    const init: HxStmt[] = [];
    const perIterationBindings: string[] = [];
    const initializer = node.initializer;
    if (initializer && ts.isVariableDeclarationList(initializer)) {
      init.push(...this.variableList(initializer));
      if (!isVarDeclarationList(initializer)) {
        for (const declaration of initializer.declarations) {
          const symbol = this.checker.getSymbolAtLocation(declaration.name);
          if (symbol && this.refersTo(node, symbol, true)) {
            perIterationBindings.push(escapeIdentifier(symbol.name));
          }
        }
      }
    } else if (initializer) {
      init.push({ kind: 'expr', expr: this.expression(initializer) });
    }
    const update: HxExpr[] = [];
    const collectUpdate = (expression: ts.Expression): void => {
      if (
        ts.isBinaryExpression(expression) &&
        expression.operatorToken.kind === ts.SyntaxKind.CommaToken
      ) {
        collectUpdate(expression.left);
        collectUpdate(expression.right);
      } else {
        update.push(this.expression(expression));
      }
    };
    if (node.incrementor) {
      collectUpdate(node.incrementor);
    }
    return [
      {
        kind: 'cFor',
        init: init.map((s) => (s.kind === 'var' ? { ...s, final: false } : s)),
        cond: node.condition && this.condition(node.condition),
        update,
        body: this.body(node.statement),
        perIterationBindings,
      },
    ];
  }

  private forOf(node: ts.ForOfStatement): HxStmt[] {
    const iterated = this.typeOf(node.expression);
    const initializer = node.initializer;
    if (
      node.awaitModifier ||
      !this.checker.isArrayType(iterated) ||
      !ts.isVariableDeclarationList(initializer) ||
      initializer.declarations.length !== 1 ||
      !ts.isIdentifier(initializer.declarations[0].name)
    ) {
      return this.unsupportedStmt(node);
    }
    const declaration = initializer.declarations[0];
    const symbol = this.checker.getSymbolAtLocation(declaration.name)!;
    const name = escapeIdentifier(symbol.name);
    const isConst = (initializer.flags & ts.NodeFlags.Const) !== 0;
    const body = this.body(node.statement);
    const iterable = this.expression(node.expression);
    if (isConst) {
      return [{ kind: 'forIn', name, iterable, body }];
    }
    const element = this.freshName(name);
    const type = this.declaredType(declaration);
    const bind: HxStmt = this.hoisted.has(symbol)
      ? {
          kind: 'expr',
          expr: {
            kind: 'assign',
            op: '=',
            target: localExpr(name, type),
            value: localExpr(element, type),
            type,
          },
        }
      : {
          kind: 'var',
          name,
          final: false,
          type,
          init: localExpr(element, type),
        };
    return [{ kind: 'forIn', name: element, iterable, body: [bind, ...body] }];
  }

  // ------------------------------------------------------------ functions

  private function(node: FunctionNode): HxFunction {
    const signature = this.checker.getSignatureFromDeclaration(node);
    const typeParams: HxTypeParam[] = (node.typeParameters ?? []).map((p) => ({
      name: escapeIdentifier(p.name.text),
      constraints: [],
    }));
    const prologue: HxStmt[] = [];
    const params: HxParam[] = node.parameters.map((parameter) => {
      if (!ts.isIdentifier(parameter.name)) {
        prologue.push(
          ...this.unsupportedStmt(
            parameter,
            'destructuring parameters are not supported yet',
          ),
        );
        return { name: this.freshName('param'), type: DYNAMIC, optional: true };
      }
      const name = escapeIdentifier(parameter.name.text);
      const declared = this.typeOf(parameter);
      if (parameter.dotDotDotToken) {
        const restName = this.freshName(name);
        const elementType = this.types.elementType(declared);
        const arrayType = this.types.map(declared);
        prologue.push({
          kind: 'var',
          name,
          final: false,
          type: arrayType,
          init: {
            kind: 'call',
            callee: {
              kind: 'field',
              target: localExpr(restName, DYNAMIC),
              name: 'toArray',
              type: DYNAMIC,
            },
            args: [],
            type: arrayType,
          },
        });
        return { name: restName, type: elementType, rest: true };
      }
      const optional =
        parameter.questionToken !== undefined ||
        parameter.initializer !== undefined;
      const type = optional
        ? nullable(this.types.map(declared))
        : this.types.map(declared);
      if (parameter.initializer) {
        prologue.push({
          kind: 'if',
          cond: {
            kind: 'binop',
            op: '==',
            left: localExpr(name, type),
            right: constExpr(null),
            type: BOOL,
          },
          then: [
            {
              kind: 'expr',
              expr: {
                kind: 'assign',
                op: '=',
                target: localExpr(name, type),
                value: this.coerce(
                  this.expression(parameter.initializer),
                  type,
                ),
                type,
              },
            },
          ],
        });
      }
      return { name, type, optional };
    });
    const ret = signature
      ? this.types.mapReturn(signature.getReturnType())
      : DYNAMIC;
    const body = node.body;
    let statements: HxStmt[] = [];
    if (body && ts.isBlock(body)) {
      statements = [
        ...this.hoistVars(body.statements),
        ...this.block(body.statements),
      ];
    } else if (body) {
      const value = this.expression(body);
      statements = sameType(ret, VOID)
        ? [{ kind: 'expr', expr: value }]
        : [{ kind: 'return', value: this.coerce(value, ret) }];
    }
    return { typeParams, params, ret, body: [...prologue, ...statements] };
  }

  /** Declares a function's `var`s at its top, as JS hoists them. */
  private hoistVars(statements: readonly ts.Statement[]): HxStmt[] {
    return this.varDeclarations(statements, false).map((declaration) => {
      const symbol = this.checker.getSymbolAtLocation(declaration.name)!;
      this.hoisted.add(symbol);
      return {
        kind: 'var',
        name: escapeIdentifier(symbol.name),
        final: false,
        type: this.declaredType(declaration),
        init: constExpr(null),
      };
    });
  }

  private functionExpr(node: FunctionNode, pos: SourcePos): HxExpr {
    if (ts.isFunctionExpression(node) && node.name) {
      return this.unsupported(
        node,
        'named function expressions are not supported yet',
      );
    }
    const fn = this.function(node);
    return {
      kind: 'fn',
      fn,
      type: {
        kind: 'fn',
        args: fn.params.map((p) => ({
          name: p.name,
          type: p.type,
          optional: p.optional,
          rest: p.rest,
        })),
        ret: fn.ret,
      },
      pos,
    };
  }

  // ---------------------------------------------------------- expressions

  /** JS `String(value)` for a value of the given TS type. */
  private toJsString = (expr: HxExpr, type: ts.Type): HxExpr => {
    if (
      everyConstituent(type, ts.TypeFlags.StringLike) ||
      isStringType(expr.type)
    ) {
      return expr;
    }
    if (everyConstituent(type, ts.TypeFlags.NumberLike)) {
      return staticCall(RUNTIME.num, 'toString', [expr], STRING, expr.pos);
    }
    if (isPure(expr) && type.flags & ts.TypeFlags.Null) {
      return constExpr('null', expr.pos);
    }
    if (
      isPure(expr) &&
      type.flags & (ts.TypeFlags.Undefined | ts.TypeFlags.Void)
    ) {
      return constExpr('undefined', expr.pos);
    }
    return staticCall(RUNTIME.ts2hx, 'string', [expr], STRING, expr.pos);
  };

  private stringOf(node: ts.Expression): HxExpr {
    return this.toJsString(this.expression(node), this.typeOf(node));
  }

  private concat(parts: HxExpr[], pos: SourcePos): HxExpr {
    const nonEmpty = parts.filter(
      (p) => !(p.kind === 'const' && p.value === ''),
    );
    if (nonEmpty.length === 0) {
      return constExpr('', pos);
    }
    if (!isStringType(nonEmpty[0].type)) {
      nonEmpty.unshift(constExpr('', pos));
    }
    return nonEmpty.reduce((left, right) => ({
      kind: 'binop',
      op: '+',
      left,
      right,
      type: STRING,
      pos,
    }));
  }

  /** JS truthiness of `expr`, made explicit from its static type (ADR 0002). */
  private truthy(expr: HxExpr, type: ts.Type): HxExpr {
    const pos = expr.pos;
    if (
      everyConstituent(type, ts.TypeFlags.BooleanLike) &&
      isBoolType(expr.type)
    ) {
      return expr;
    }
    if (
      everyConstituent(type, ts.TypeFlags.BooleanLike | NULLISH_FLAGS) &&
      constituents(type).some((t) => t.flags & ts.TypeFlags.BooleanLike)
    ) {
      return {
        kind: 'binop',
        op: '==',
        left: expr,
        right: constExpr(true),
        type: BOOL,
        pos,
      };
    }
    if (
      everyConstituent(type, ts.TypeFlags.NumberLike) &&
      !isNullable(expr.type)
    ) {
      return staticCall(RUNTIME.num, 'truthy', [expr], BOOL, pos);
    }
    if (everyConstituent(type, ts.TypeFlags.StringLike | NULLISH_FLAGS)) {
      return staticCall(RUNTIME.ts2hx, 'truthyString', [expr], BOOL, pos);
    }
    if (everyConstituent(type, OBJECT_FLAGS | NULLISH_FLAGS)) {
      return {
        kind: 'binop',
        op: '!=',
        left: expr,
        right: constExpr(null),
        type: BOOL,
        pos,
      };
    }
    return staticCall(RUNTIME.ts2hx, 'truthy', [expr], BOOL, pos);
  }

  private condition(node: ts.Expression): HxExpr {
    return this.truthy(this.expression(node), this.typeOf(node));
  }

  private not(cond: HxExpr, pos: SourcePos): HxExpr {
    return {
      kind: 'unop',
      op: '!',
      postfix: false,
      operand: cond,
      type: BOOL,
      pos,
    };
  }

  /** Evaluates `value` once: returns a readable reference plus the temporaries it needs. */
  private once(value: HxExpr): { ref: HxExpr; stmts: HxStmt[] } {
    if (isPure(value)) {
      return { ref: value, stmts: [] };
    }
    const name = this.freshName('value');
    return {
      ref: localExpr(name, value.type),
      stmts: [
        { kind: 'var', name, final: true, type: value.type, init: value },
      ],
    };
  }

  private withStmts(stmts: HxStmt[], result: HxExpr): HxExpr {
    return stmts.length === 0
      ? result
      : {
          kind: 'blockExpr',
          stmts,
          result,
          type: result.type,
          pos: result.pos,
        };
  }

  expression(node: ts.Expression): HxExpr {
    const pos = this.pos(node);
    if (ts.isParenthesizedExpression(node)) {
      return this.expression(node.expression);
    }
    if (ts.isNumericLiteral(node)) {
      return constExpr(Number(node.text), pos);
    }
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      return constExpr(node.text, pos);
    }
    switch (node.kind) {
      case ts.SyntaxKind.TrueKeyword:
        return constExpr(true, pos);
      case ts.SyntaxKind.FalseKeyword:
        return constExpr(false, pos);
      case ts.SyntaxKind.NullKeyword:
        return constExpr(null, pos);
    }
    if (ts.isNonNullExpression(node) || ts.isSatisfiesExpression(node)) {
      return this.expression(node.expression);
    }
    if (ts.isAsExpression(node) || ts.isTypeAssertionExpression(node)) {
      return this.coerce(this.expression(node.expression), this.hxTypeOf(node));
    }
    if (ts.isTemplateExpression(node)) {
      return this.template(node, pos);
    }
    if (ts.isIdentifier(node)) {
      return this.identifier(node, pos);
    }
    if (ts.isPropertyAccessExpression(node)) {
      return this.propertyAccess(node, pos);
    }
    if (ts.isPrefixUnaryExpression(node)) {
      return this.prefixUnary(node, pos);
    }
    if (ts.isPostfixUnaryExpression(node)) {
      return this.increment(node, node.operand, node.operator, true, pos);
    }
    if (ts.isBinaryExpression(node)) {
      return this.binary(node, pos);
    }
    if (ts.isConditionalExpression(node)) {
      return this.conditional(node, pos);
    }
    if (ts.isTypeOfExpression(node)) {
      return this.typeOfExpression(node, pos);
    }
    if (ts.isCallExpression(node)) {
      return this.call(node, pos);
    }
    if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) {
      return this.functionExpr(node, pos);
    }
    if (ts.isArrayLiteralExpression(node)) {
      return this.arrayLiteral(node, pos);
    }
    if (ts.isObjectLiteralExpression(node)) {
      return this.objectLiteral(node, pos);
    }
    return this.unsupported(node);
  }

  private template(node: ts.TemplateExpression, pos: SourcePos): HxExpr {
    const parts: HxExpr[] = [constExpr(node.head.text, pos)];
    for (const span of node.templateSpans) {
      parts.push(this.stringOf(span.expression));
      parts.push(constExpr(span.literal.text, pos));
    }
    return this.concat(parts, pos);
  }

  private libKey(
    node: ts.Node,
    symbol = this.checker.getSymbolAtLocation(node),
  ) {
    return stdlibKey(this.model.program, this.checker, symbol);
  }

  /** The declaration of a binding of this module, or `undefined` for lib and imported symbols. */
  private localDeclaration(
    symbol: ts.Symbol | undefined,
  ): ts.Declaration | undefined {
    const declaration = symbol?.valueDeclaration ?? symbol?.declarations?.[0];
    return declaration && declaration.getSourceFile() === this.sourceFile
      ? declaration
      : undefined;
  }

  private identifier(node: ts.Identifier, pos: SourcePos): HxExpr {
    const symbol =
      ts.isShorthandPropertyAssignment(node.parent) && node.parent.name === node
        ? this.checker.getShorthandAssignmentValueSymbol(node.parent)
        : this.checker.getSymbolAtLocation(node);
    if (node.text === 'undefined' && !this.localDeclaration(symbol)) {
      return constExpr(null, pos);
    }
    const key = this.libKey(node, symbol);
    if (key !== undefined) {
      return VALUE_BINDINGS.get(key)?.(pos) ?? this.unsupported(node);
    }
    const declaration = this.localDeclaration(symbol);
    if (!symbol || !declaration) {
      return this.unsupported(
        node,
        `${node.text}: imported bindings are not supported yet`,
      );
    }
    if (
      !ts.isVariableDeclaration(declaration) &&
      !ts.isParameter(declaration) &&
      !ts.isFunctionDeclaration(declaration)
    ) {
      return this.unsupported(node);
    }
    return localExpr(
      escapeIdentifier(symbol.name),
      ts.isVariableDeclaration(declaration)
        ? this.declaredType(declaration)
        : ts.isParameter(declaration)
          ? this.parameterType(declaration)
          : this.types.map(this.checker.getTypeOfSymbol(symbol)),
      pos,
    );
  }

  private parameterType(parameter: ts.ParameterDeclaration): HxType {
    const type = this.types.map(this.typeOf(parameter));
    return parameter.questionToken || parameter.initializer
      ? nullable(type)
      : type;
  }

  private propertyAccess(
    node: ts.PropertyAccessExpression,
    pos: SourcePos,
  ): HxExpr {
    const key = this.libKey(node.name);
    if (key !== undefined) {
      const property = PROPERTY_BINDINGS.get(key);
      if (property) {
        return property(this.expression(node.expression), pos);
      }
      return VALUE_BINDINGS.get(key)?.(pos) ?? this.unsupported(node);
    }
    if (node.questionDotToken || ts.isPrivateIdentifier(node.name)) {
      return this.unsupported(node);
    }
    return {
      kind: 'field',
      target: this.expression(node.expression),
      name: escapeIdentifier(node.name.text),
      type: this.hxTypeOf(node),
      pos,
    };
  }

  /** An assignable reference: a binding of this module or a field. */
  private lvalue(node: ts.Expression): HxExpr | undefined {
    while (ts.isParenthesizedExpression(node) || ts.isNonNullExpression(node)) {
      node = node.expression;
    }
    if (ts.isIdentifier(node)) {
      const target = this.identifier(node, this.pos(node));
      return target.kind === 'local' ? target : undefined;
    }
    if (
      ts.isPropertyAccessExpression(node) &&
      this.libKey(node.name) === undefined
    ) {
      const target = this.propertyAccess(node, this.pos(node));
      return target.kind === 'field' ? target : undefined;
    }
    return undefined;
  }

  private prefixUnary(node: ts.PrefixUnaryExpression, pos: SourcePos): HxExpr {
    const operand = node.operand;
    switch (node.operator) {
      case ts.SyntaxKind.ExclamationToken:
        return this.not(this.condition(operand), pos);
      case ts.SyntaxKind.PlusPlusToken:
      case ts.SyntaxKind.MinusMinusToken:
        return this.increment(node, operand, node.operator, false, pos);
      case ts.SyntaxKind.PlusToken:
      case ts.SyntaxKind.MinusToken: {
        const number = this.toNumber(operand);
        if (!number) return this.unsupported(node);
        return node.operator === ts.SyntaxKind.PlusToken
          ? number
          : {
              kind: 'unop',
              op: '-',
              postfix: false,
              operand: number,
              type: FLOAT,
              pos,
            };
      }
      case ts.SyntaxKind.TildeToken: {
        const number = this.toNumber(operand);
        if (!number) return this.unsupported(node);
        return {
          kind: 'unop',
          op: '~',
          postfix: false,
          operand: staticCall(RUNTIME.num, 'toInt32', [number], INT, pos),
          type: INT,
          pos,
        };
      }
    }
  }

  /** JS `ToNumber` of a number, string or boolean operand. */
  private toNumber(node: ts.Expression): HxExpr | undefined {
    const value = this.expression(node);
    if (this.isNumberLike(node)) return value;
    if (this.isStringLike(node)) {
      return staticCall(RUNTIME.num, 'fromString', [value], FLOAT, value.pos);
    }
    if (this.isBooleanLike(node)) {
      return {
        kind: 'ternary',
        cond: this.truthy(value, this.typeOf(node)),
        then: constExpr(1),
        else: constExpr(0),
        type: FLOAT,
        pos: value.pos,
      };
    }
    return undefined;
  }

  private increment(
    node: ts.Expression,
    operand: ts.Expression,
    operator: ts.SyntaxKind,
    postfix: boolean,
    pos: SourcePos,
  ): HxExpr {
    const target = this.lvalue(operand);
    if (!target || !this.isNumberLike(operand)) {
      return this.unsupported(node);
    }
    return {
      kind: 'unop',
      op: operator === ts.SyntaxKind.PlusPlusToken ? '++' : '--',
      postfix,
      operand: target,
      type: FLOAT,
      pos,
    };
  }

  private binary(node: ts.BinaryExpression, pos: SourcePos): HxExpr {
    const kind = node.operatorToken.kind;
    switch (kind) {
      case ts.SyntaxKind.EqualsToken:
        return this.assign(node, pos);
      case ts.SyntaxKind.CommaToken: {
        const left = this.expression(node.left);
        const right = this.expression(node.right);
        return this.withStmts([{ kind: 'expr', expr: left }], right);
      }
      case ts.SyntaxKind.AmpersandAmpersandToken:
      case ts.SyntaxKind.BarBarToken:
        return this.logical(node, kind, pos);
      case ts.SyntaxKind.QuestionQuestionToken:
        return this.nullish(node, pos);
      case ts.SyntaxKind.EqualsEqualsEqualsToken:
      case ts.SyntaxKind.ExclamationEqualsEqualsToken:
        return this.strictEquality(
          node,
          kind === ts.SyntaxKind.ExclamationEqualsEqualsToken,
          pos,
        );
      case ts.SyntaxKind.EqualsEqualsToken:
      case ts.SyntaxKind.ExclamationEqualsToken:
        return this.looseEquality(
          node,
          kind === ts.SyntaxKind.ExclamationEqualsToken,
          pos,
        );
    }
    const compound = COMPOUND_ASSIGNMENTS.get(kind);
    if (compound !== undefined) {
      return this.compoundAssign(node, compound, pos);
    }
    const comparison = COMPARISON_OPERATORS.get(kind);
    if (comparison) {
      const comparable =
        (this.isNumberLike(node.left) && this.isNumberLike(node.right)) ||
        (this.isStringLike(node.left) && this.isStringLike(node.right));
      return comparable
        ? {
            kind: 'binop',
            op: comparison,
            left: this.expression(node.left),
            right: this.expression(node.right),
            type: BOOL,
            pos,
          }
        : this.unsupported(node);
    }
    return (
      this.operation(kind, node.left, node.right, pos) ?? this.unsupported(node)
    );
  }

  /** Arithmetic, string `+` and bitwise operators; `undefined` for operand types it does not handle. */
  private operation(
    kind: ts.SyntaxKind,
    leftNode: ts.Expression,
    rightNode: ts.Expression,
    pos: SourcePos,
    left: HxExpr = this.expression(leftNode),
  ): HxExpr | undefined {
    if (
      kind === ts.SyntaxKind.PlusToken &&
      (this.isStringLike(leftNode) || this.isStringLike(rightNode))
    ) {
      return this.concat(
        [
          this.toJsString(left, this.typeOf(leftNode)),
          this.stringOf(rightNode),
        ],
        pos,
      );
    }
    if (!this.isNumberLike(leftNode) || !this.isNumberLike(rightNode)) {
      return undefined;
    }
    const right = this.expression(rightNode);
    const floatOp = FLOAT_OPERATORS.get(kind);
    if (floatOp) {
      return { kind: 'binop', op: floatOp, left, right, type: FLOAT, pos };
    }
    const int32Op = INT32_OPERATORS.get(kind);
    if (int32Op) {
      const toInt32 = (e: HxExpr) =>
        staticCall(RUNTIME.num, 'toInt32', [e], INT, pos);
      return {
        kind: 'binop',
        op: int32Op,
        left: toInt32(left),
        right: toInt32(right),
        type: INT,
        pos,
      };
    }
    const runtime = NUM_OPERATORS.get(kind);
    return runtime
      ? staticCall(RUNTIME.num, runtime, [left, right], FLOAT, pos)
      : undefined;
  }

  private assign(node: ts.BinaryExpression, pos: SourcePos): HxExpr {
    const target = this.lvalue(node.left);
    if (!target) {
      return this.unsupported(node);
    }
    return {
      kind: 'assign',
      op: '=',
      target,
      value: this.coerce(this.expression(node.right), target.type),
      type: target.type,
      pos,
    };
  }

  private compoundAssign(
    node: ts.BinaryExpression,
    operator: ts.BinaryOperator,
    pos: SourcePos,
  ): HxExpr {
    const target = this.lvalue(node.left);
    if (!target) {
      return this.unsupported(node);
    }
    const floatOp = FLOAT_OPERATORS.get(operator);
    const numeric =
      this.isNumberLike(node.left) && this.isNumberLike(node.right);
    if (floatOp && numeric) {
      return {
        kind: 'assign',
        op: `${floatOp}=` as HxAssignOp,
        target,
        value: this.expression(node.right),
        type: FLOAT,
        pos,
      };
    }
    if (operator === ts.SyntaxKind.PlusToken && this.isStringLike(node.left)) {
      return {
        kind: 'assign',
        op: '+=',
        target,
        value: this.stringOf(node.right),
        type: STRING,
        pos,
      };
    }
    if (target.kind !== 'local') {
      return this.unsupported(node);
    }
    const value = this.operation(operator, node.left, node.right, pos, target);
    return value
      ? {
          kind: 'assign',
          op: '=',
          target,
          value: this.coerce(value, target.type),
          type: target.type,
          pos,
        }
      : this.unsupported(node);
  }

  private logical(
    node: ts.BinaryExpression,
    kind: ts.SyntaxKind,
    pos: SourcePos,
  ): HxExpr {
    const left = this.expression(node.left);
    const right = this.expression(node.right);
    const isAnd = kind === ts.SyntaxKind.AmpersandAmpersandToken;
    if (
      isBoolType(left.type) &&
      isBoolType(right.type) &&
      this.isBooleanLike(node.left) &&
      this.isBooleanLike(node.right)
    ) {
      return {
        kind: 'binop',
        op: isAnd ? '&&' : '||',
        left,
        right,
        type: BOOL,
        pos,
      };
    }
    const { ref, stmts } = this.once(left);
    const type = this.joinTypes(this.hxTypeOf(node), [ref, right]);
    const cond = this.truthy(ref, this.typeOf(node.left));
    const kept = this.branch(ref, type);
    const other = this.branch(right, type);
    return this.withStmts(stmts, {
      kind: 'ternary',
      cond,
      then: isAnd ? other : kept,
      else: isAnd ? kept : other,
      type,
      pos,
    });
  }

  private nullish(node: ts.BinaryExpression, pos: SourcePos): HxExpr {
    const left = this.expression(node.left);
    if (!isNullable(left.type)) {
      return left;
    }
    const right = this.expression(node.right);
    const type = this.joinTypes(this.hxTypeOf(node), [left, right]);
    return {
      kind: 'binop',
      op: '??',
      left: this.branch(left, type.kind === 'dynamic' ? type : nullable(type)),
      right: this.branch(right, type),
      type,
      pos,
    };
  }

  private isNullishLiteral(node: ts.Expression): boolean {
    return (
      node.kind === ts.SyntaxKind.NullKeyword ||
      (ts.isIdentifier(node) &&
        node.text === 'undefined' &&
        !this.localDeclaration(this.checker.getSymbolAtLocation(node)))
    );
  }

  private equality(
    left: HxExpr,
    right: HxExpr,
    negated: boolean,
    pos: SourcePos,
  ): HxExpr {
    const comparable =
      this.unifies(left.type, right.type) ||
      this.unifies(right.type, left.type);
    return {
      kind: 'binop',
      op: negated ? '!=' : '==',
      left: comparable ? left : this.coerce(left, DYNAMIC),
      right: comparable ? right : this.coerce(right, DYNAMIC),
      type: BOOL,
      pos,
    };
  }

  private strictEquality(
    node: ts.BinaryExpression,
    negated: boolean,
    pos: SourcePos,
  ): HxExpr {
    return this.equality(
      this.expression(node.left),
      this.expression(node.right),
      negated,
      pos,
    );
  }

  private looseEquality(
    node: ts.BinaryExpression,
    negated: boolean,
    pos: SourcePos,
  ): HxExpr {
    const left = this.expression(node.left);
    const right = this.expression(node.right);
    const samePrimitive = [
      ts.TypeFlags.NumberLike,
      ts.TypeFlags.StringLike,
      ts.TypeFlags.BooleanLike,
    ].some(
      (flags) =>
        everyConstituent(this.typeOf(node.left), flags) &&
        everyConstituent(this.typeOf(node.right), flags),
    );
    if (
      samePrimitive ||
      this.isNullishLiteral(node.left) ||
      this.isNullishLiteral(node.right)
    ) {
      return this.equality(left, right, negated, pos);
    }
    const call = staticCall(RUNTIME.ts2hx, 'looseEq', [left, right], BOOL, pos);
    return negated ? this.not(call, pos) : call;
  }

  private conditional(node: ts.ConditionalExpression, pos: SourcePos): HxExpr {
    const cond = this.condition(node.condition);
    const whenTrue = this.expression(node.whenTrue);
    const whenFalse = this.expression(node.whenFalse);
    const type = this.joinTypes(this.hxTypeOf(node), [whenTrue, whenFalse]);
    return {
      kind: 'ternary',
      cond,
      then: this.branch(whenTrue, type),
      else: this.branch(whenFalse, type),
      type,
      pos,
    };
  }

  /** The `typeof` result every value of `type` has, if there is one. */
  private staticTypeOf(type: ts.Type): string | undefined {
    if (everyConstituent(type, ts.TypeFlags.NumberLike)) return 'number';
    if (everyConstituent(type, ts.TypeFlags.StringLike)) return 'string';
    if (everyConstituent(type, ts.TypeFlags.BooleanLike)) return 'boolean';
    if (everyConstituent(type, ts.TypeFlags.Undefined | ts.TypeFlags.Void))
      return 'undefined';
    if (everyConstituent(type, ts.TypeFlags.Null)) return 'object';
    if (type.isUnion() || !(type.flags & ts.TypeFlags.Object)) return undefined;
    if (type.getCallSignatures().length > 0) return 'function';
    return type.getConstructSignatures().length > 0 ? undefined : 'object';
  }

  private typeOfExpression(node: ts.TypeOfExpression, pos: SourcePos): HxExpr {
    const operand = this.expression(node.expression);
    const known = this.staticTypeOf(this.typeOf(node.expression));
    if (known !== undefined && isPure(operand)) {
      return constExpr(known, pos);
    }
    return staticCall(RUNTIME.ts2hx, 'typeOf', [operand], STRING, pos);
  }

  private arrayLiteral(
    node: ts.ArrayLiteralExpression,
    pos: SourcePos,
  ): HxExpr {
    if (
      node.elements.some(
        (e) => ts.isSpreadElement(e) || ts.isOmittedExpression(e),
      )
    ) {
      return this.unsupported(node);
    }
    const type = this.hxTypeOf(node);
    const element =
      type.kind === 'path' && type.path.name === 'Array'
        ? type.params[0]
        : DYNAMIC;
    return {
      kind: 'arrayLit',
      elements: node.elements.map((e) =>
        this.coerce(this.expression(e), element),
      ),
      type,
      pos,
    };
  }

  private objectLiteral(
    node: ts.ObjectLiteralExpression,
    pos: SourcePos,
  ): HxExpr {
    const fields: Array<{ name: string; value: HxExpr }> = [];
    for (const property of node.properties) {
      const name =
        property.name &&
        (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name))
          ? property.name.text
          : undefined;
      if (name === undefined) {
        return this.unsupported(node);
      }
      if (ts.isPropertyAssignment(property)) {
        fields.push({
          name: escapeIdentifier(name),
          value: this.expression(property.initializer),
        });
      } else if (
        ts.isShorthandPropertyAssignment(property) &&
        !property.objectAssignmentInitializer
      ) {
        fields.push({
          name: escapeIdentifier(name),
          value: this.expression(property.name),
        });
      } else if (ts.isMethodDeclaration(property) && !property.asteriskToken) {
        fields.push({
          name: escapeIdentifier(name),
          value: this.functionExpr(property, this.pos(property)),
        });
      } else {
        return this.unsupported(node);
      }
    }
    return { kind: 'objectLit', fields, type: this.hxTypeOf(node), pos };
  }

  private call(node: ts.CallExpression, pos: SourcePos): HxExpr {
    const callee = node.expression;
    const spreadIndex = node.arguments.findIndex(ts.isSpreadElement);
    const spreadLast =
      spreadIndex === node.arguments.length - 1 && spreadIndex >= 0;
    if (spreadIndex >= 0 && !spreadLast) {
      return this.unsupported(node);
    }
    const args = node.arguments.map((a) =>
      this.expression(ts.isSpreadElement(a) ? a.expression : a),
    );
    const nameNode = ts.isPropertyAccessExpression(callee)
      ? callee.name
      : ts.isIdentifier(callee)
        ? callee
        : undefined;
    const key = nameNode && this.libKey(nameNode);
    if (key !== undefined) {
      const binding = CALL_BINDINGS.get(key);
      const bound = binding?.({
        receiver: ts.isPropertyAccessExpression(callee)
          ? this.receiver(callee.expression)
          : undefined,
        args,
        argTypes: node.arguments.map((a) => this.typeOf(a)),
        pos,
        toJsString: this.toJsString,
        spreadLast,
        freshName: (hint) => this.freshName(hint),
      });
      return bound ?? this.unsupported(node);
    }
    if (ts.isPropertyAccessExpression(callee) && callee.questionDotToken) {
      return this.unsupported(node);
    }
    if (node.questionDotToken || callee.kind === ts.SyntaxKind.SuperKeyword) {
      return this.unsupported(node);
    }
    if (spreadLast && !this.spreadsIntoRest(node, spreadIndex)) {
      return this.unsupported(
        node,
        'spread into a non-rest parameter is not supported yet',
      );
    }
    const signature = this.checker.getResolvedSignature(node);
    const ret = signature
      ? this.types.mapReturn(signature.getReturnType())
      : DYNAMIC;
    const parameterTypes = signature
      ? (this.types.signatureType(signature) as Extract<HxType, { kind: 'fn' }>)
          .args
      : [];
    return {
      kind: 'call',
      callee: this.expression(callee),
      args: args.map((arg, i) => {
        const parameter =
          parameterTypes[Math.min(i, parameterTypes.length - 1)];
        return parameter && !(spreadLast && i === args.length - 1)
          ? this.coerce(
              arg,
              parameter.optional ? nullable(parameter.type) : parameter.type,
            )
          : arg;
      }),
      spreadLast,
      type: ret,
      pos,
    };
  }

  private spreadsIntoRest(
    node: ts.CallExpression,
    spreadIndex: number,
  ): boolean {
    const declaration = this.checker.getResolvedSignature(node)?.declaration;
    if (!declaration || ts.isJSDocSignature(declaration)) return false;
    const last = declaration.parameters[declaration.parameters.length - 1];
    return (
      last?.dotDotDotToken !== undefined &&
      declaration.parameters.length - 1 === spreadIndex
    );
  }

  private receiver(expression: ts.Expression): BoundReceiver {
    let target = expression;
    while (ts.isParenthesizedExpression(target)) {
      target = target.expression;
    }
    let converted: HxExpr | undefined;
    const convert = () => (converted ??= this.expression(expression));
    return {
      libKey: ts.isIdentifier(target) ? this.libKey(target) : undefined,
      get expr() {
        return convert();
      },
    };
  }
}
