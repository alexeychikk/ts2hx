import ts from 'typescript';

import {
  ANY,
  arrayType,
  BOOL,
  constExpr,
  dictType,
  dictValue,
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
  typePath,
  unsupportedExpr,
  VOID,
} from '../ir/builders';
import type {
  HxAccess,
  HxAssignOp,
  HxBinop,
  HxClassField,
  HxDecl,
  HxExpr,
  HxFunction,
  HxModule,
  HxParam,
  HxStmt,
  HxType,
  HxTypeParam,
  HxTypePath,
  SourcePos,
} from '../ir/types';
import type {
  ModuleInfo,
  ModuleValue,
  ProjectModel,
} from '../model/project-model';
import { escapeIdentifier } from '../model/names';
import {
  type BoundReceiver,
  CALL_BINDINGS,
  PROPERTY_BINDINGS,
  stdlibKey,
  VALUE_BINDINGS,
} from '../stdlib/bindings';
import {
  accessorPair,
  assignsAtTopLevel,
  inheritedAccessors,
  overridesAccessor,
  privateMemberName,
  extendsClause,
  type FieldDeclaration,
  hasModifier,
  isFieldDeclaration,
  isParameterProperty,
  isStatic,
  mayReadFieldsBeforeInit,
  redeclaredWrittenFields,
  structuralOptionalMembers,
  inheritsStructuralMember,
  overridesImplementation,
  owningClass,
  rootField,
  superCallStatement,
} from './classes';
import { explicitlyNullable, isNullable, nullable, TypeMapper } from './types';

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

const STD = typePath([], 'Std');
const REFLECT = typePath([], 'Reflect');

/** A type declared inside a module (class or typedef): a downcast to another one is a `cast`. */
function isModuleSubType(type: HxType): boolean {
  return type.kind === 'path' && type.path.name !== type.path.module;
}

function isArray(
  type: HxType,
): type is Extract<HxType, { kind: 'path' }> & { params: [HxType] } {
  return (
    type.kind === 'path' &&
    type.path.pack.length === 0 &&
    type.path.name === 'Array'
  );
}

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

/**
 * `target op= value`, or `target = target op value` when `spelledOut`: Haxe 4.3's
 * JS generator breaks a compound assignment to a module var used as a value.
 */
function compoundExpr(
  target: HxExpr,
  op: HxBinop,
  value: HxExpr,
  type: HxType,
  pos: SourcePos,
  spelledOut: boolean,
): HxExpr {
  return spelledOut
    ? {
        kind: 'assign',
        op: '=',
        target,
        value: { kind: 'binop', op, left: target, right: value, type, pos },
        type,
        pos,
      }
    : { kind: 'assign', op: `${op}=` as HxAssignOp, target, value, type, pos };
}

/** Whether the value of `node` is read, rather than discarded by a statement position. */
function isValueUsed(node: ts.Expression): boolean {
  const { parent } = node;
  return !(
    ts.isExpressionStatement(parent) ||
    (ts.isForStatement(parent) && parent.incrementor === node) ||
    (ts.isBinaryExpression(parent) &&
      parent.operatorToken.kind === ts.SyntaxKind.CommaToken &&
      parent.left === node)
  );
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
  | ts.MethodDeclaration
  | ts.AccessorDeclaration
  | ts.ConstructorDeclaration;

/** The class whose member is being converted: `this` is its instance, or the class in a static member. */
interface ClassContext {
  path: HxTypePath;
  isStatic: boolean;
}

/** Field initialisers of the constructor being converted, run after `after` (its `super()` call) or first. */
interface PendingInits {
  after?: ts.Statement;
  stmts: HxStmt[];
}

/** A Haxe field initialiser: a constant, evaluated before any module `__init()`. */
function isConstantInit(expr: HxExpr): boolean {
  return expr.kind === 'const';
}

function memberAccess(member: ts.Node): HxAccess {
  const name = (member as ts.NamedDeclaration).name;
  return (name && ts.isPrivateIdentifier(name)) ||
    hasModifier(
    member,
    ts.ModifierFlags.Private | ts.ModifierFlags.Protected,
  )
    ? 'private'
    : 'public';
}

/** Name of a class member Haxe can declare: an identifier, a string literal or a `#name`. */
function memberName(
  member: ts.NamedDeclaration,
  checker: ts.TypeChecker,
): string | undefined {
  const name = member.name;
  if (name && ts.isPrivateIdentifier(name)) {
    return privateMemberName(
      checker,
      member as ts.NamedDeclaration & { name: ts.PrivateIdentifier },
    );
  }
  return name && (ts.isIdentifier(name) || ts.isStringLiteral(name))
    ? escapeIdentifier(name.text)
    : undefined;
}

/** Converts one TS source file into a Haxe IR module (ADR 0001, Frontend). */
export class ModuleFrontend {
  private readonly checker: ts.TypeChecker;
  private readonly sourceFile: ts.SourceFile;
  private readonly types: TypeMapper;
  /** `var`s and module-level bindings: declared up front, so their declarations only assign. */
  private readonly hoisted = new Set<ts.Symbol>();
  /** Block `let`/`const`s hoisted for a function reached before them: read before assigned. */
  private readonly hoistedLexicals = new Set<ts.Symbol>();
  /** Haxe return types of the functions being converted, innermost last. */
  private readonly returnTypes: HxType[] = [];
  private readonly classContexts: ClassContext[] = [];
  private pendingInits?: PendingInits;
  /** The value a setter returns, for `return;` at its `returnTypes` depth. */
  private setterResult?: { depth: number; value: HxExpr & { kind: 'local' } };
  private tempCounter = 0;

  constructor(
    private readonly model: ProjectModel,
    private readonly info: ModuleInfo,
    private readonly report: (unsupported: UnsupportedReport) => void,
  ) {
    this.checker = model.checker;
    this.sourceFile = info.sourceFile;
    this.types = new TypeMapper(
      this.checker,
      (sourceFile) => model.moduleOf(sourceFile)?.path,
    );
  }

  convert(): HxModule {
    const decls: HxDecl[] = this.types.typedefs(this.sourceFile);
    for (const declaration of this.varDeclarations(
      this.sourceFile.statements,
      true,
    )) {
      const symbol = this.checker.getSymbolAtLocation(declaration.name)!;
      this.hoisted.add(symbol);
      decls.push({
        kind: 'moduleVar',
        name: this.bindingName(declaration),
        final: false,
        type: this.declaredType(declaration),
      });
    }
    const init: HxStmt[] = [];
    for (const statement of this.sourceFile.statements) {
      if (ts.isFunctionDeclaration(statement)) {
        if (!statement.body) continue;
        decls.push({
          kind: 'moduleFunction',
          name: this.info.fields.get(statement)!,
          fn: this.function(statement),
        });
      } else if (ts.isClassDeclaration(statement)) {
        const converted = this.classDeclaration(statement);
        if (converted.decl) decls.push(converted.decl);
        init.push(...converted.init);
      } else if (ts.isExportAssignment(statement)) {
        init.push(...this.exportAssignment(statement, decls));
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

  /** `export default <expression>`: a module var assigned where the export stands. */
  private exportAssignment(
    statement: ts.ExportAssignment,
    decls: HxDecl[],
  ): HxStmt[] {
    const name = this.info.fields.get(statement);
    if (statement.isExportEquals) {
      return this.unsupportedStmt(statement, '`export =` is not supported');
    }
    if (name === undefined) {
      return [];
    }
    const type = this.hxTypeOf(statement.expression);
    decls.push({ kind: 'moduleVar', name, final: false, type });
    return [
      {
        kind: 'expr',
        expr: {
          kind: 'assign',
          op: '=',
          target: localExpr(name, type),
          value: this.coerce(this.expression(statement.expression), type),
          type,
        },
      },
    ];
  }

  /**
   * Haxe name of a local binding: escaped, and renamed when it would shadow a root
   * package the generated code references (`lib` in `lib.Util.f()`).
   */
  private localName(name: string): string {
    const id = escapeIdentifier(name);
    return this.model.reservedLocalNames.has(id) ? `${id}_` : id;
  }

  /** Haxe name of a variable: its module field name at the top level (ProjectModel). */
  private bindingName(declaration: ts.VariableDeclaration): string {
    return (
      this.info.fields.get(declaration) ??
      this.localName((declaration.name as ts.Identifier).text)
    );
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

  private isDict(node: ts.Node): boolean {
    const type = this.checker.getNonNullableType(this.typeOf(node));
    return this.types.dictValueType(type) !== undefined;
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
    ) ||
      (symbol && this.hoistedLexicals.has(symbol))
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
    if (
      from.kind === 'path' &&
      to.kind === 'path' &&
      this.types.isSubclass(from.path, to.path)
    ) {
      return true;
    }
    if (isArray(from) && isArray(to)) {
      const [fromElement, toElement] = [from.params[0], to.params[0]];
      return (
        sameType(fromElement, toElement) ||
        fromElement.kind === 'dynamic' ||
        toElement.kind === 'dynamic' ||
        (fromElement.kind === 'fn' && toElement.kind === 'fn')
      );
    }
    return from.kind === 'fn' && to.kind === 'fn';
  }

  /**
   * `value` read where the checker narrows its type (ADR 0005): a `Dynamic` union
   * narrowed to a type Haxe knows (a member, a primitive) is cast to it.
   */
  private narrow(value: HxExpr, node: ts.Expression): HxExpr {
    const declared = value.type.kind === 'null' ? value.type.inner : value.type;
    if (
      value.kind === 'unsupported' ||
      (declared.kind !== 'dynamic' &&
        !sameType(declared, ANY) &&
        !isModuleSubType(declared))
    ) {
      return value;
    }
    const narrowed = this.hxTypeOf(node);
    if (
      isModuleSubType(declared) &&
      (!isModuleSubType(narrowed) || sameType(narrowed, declared))
    ) {
      return value;
    }
    if (narrowed.kind === 'dynamic' || sameType(narrowed, value.type)) {
      return value;
    }
    return {
      kind: 'cast',
      expr: value,
      checked: false,
      type: narrowed,
      pos: value.pos,
    };
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

  /**
   * A block in source order. Haxe types a local function where it is declared, so a
   * function JS needs earlier (see `deferredFunctions`) becomes a `var` declared at the
   * top of the block and assigned once the `let`/`const`s it captures exist, or at the
   * top of the block with those `let`/`const`s hoisted when it may be reached before.
   */
  private block(statements: readonly ts.Statement[]): HxStmt[] {
    const { assignAt, hoistedLexicals } = this.deferredFunctions(statements);
    const declarations: HxStmt[] = hoistedLexicals.map((declaration) => {
      const symbol = this.checker.getSymbolAtLocation(declaration.name)!;
      this.hoisted.add(symbol);
      this.hoistedLexicals.add(symbol);
      return {
        kind: 'var',
        name: this.localName((declaration.name as ts.Identifier).text),
        final: false,
        type: this.declaredType(declaration),
        init: constExpr(null),
      };
    });
    const assignments = new Map<number, HxStmt[]>();
    for (const [declaration, index] of assignAt) {
      const { name, type, value } = this.deferredFunction(declaration);
      declarations.push({
        kind: 'var',
        name,
        final: false,
        type,
        init: constExpr(null),
      });
      assignments.set(index, [
        ...(assignments.get(index) ?? []),
        {
          kind: 'expr',
          expr: {
            kind: 'assign',
            op: '=',
            target: localExpr(name, type),
            value,
            type,
          },
        },
      ]);
    }
    const body: HxStmt[] = [...declarations];
    statements.forEach((statement, index) => {
      body.push(...(assignments.get(index) ?? []));
      if (!assignAt.has(statement as ts.FunctionDeclaration)) {
        body.push(...this.statement(statement));
      }
    });
    body.push(...(assignments.get(statements.length) ?? []));
    return body;
  }

  /**
   * Function declarations of a block that cannot stay a Haxe local function at their
   * source position: those referenced before it, those a deferred function calls, and
   * those capturing a `let`/`const` declared after them. `assignAt` maps each to the
   * index of the statement its assignment precedes: right after the last `let`/`const`
   * it captures, or 0 when it captures none or an earlier statement may reach it. The
   * `let`/`const`s captured by a function assigned at 0, or by a closure appearing before
   * their declaration, are `hoistedLexicals`.
   */
  private deferredFunctions(statements: readonly ts.Statement[]): {
    assignAt: Map<ts.FunctionDeclaration, number>;
    hoistedLexicals: ts.VariableDeclaration[];
  } {
    const functions = new Map<ts.Symbol, ts.FunctionDeclaration>();
    for (const statement of statements) {
      if (
        ts.isFunctionDeclaration(statement) &&
        statement.name &&
        statement.body
      ) {
        functions.set(
          this.checker.getSymbolAtLocation(statement.name)!,
          statement,
        );
      }
    }
    const lexicalIndex = (declaration: ts.VariableDeclaration): number =>
      statements.indexOf(declaration.parent.parent);
    const deferred = new Set<ts.FunctionDeclaration>();
    for (const [symbol, declaration] of functions) {
      const index = statements.indexOf(declaration);
      if (
        statements.slice(0, index).some((s) => this.refersTo(s, symbol)) ||
        this.capturedLexicals(declaration, statements).some(
          (d) => lexicalIndex(d) > index,
        )
      ) {
        deferred.add(declaration);
      }
    }
    const pending = [...deferred];
    while (pending.length > 0) {
      const caller = pending.pop()!;
      for (const [symbol, declaration] of functions) {
        if (!deferred.has(declaration) && this.refersTo(caller, symbol)) {
          deferred.add(declaration);
          pending.push(declaration);
        }
      }
    }
    const assignAt = new Map<ts.FunctionDeclaration, number>();
    const hoistedLexicals = new Set<ts.VariableDeclaration>();
    for (const [symbol, declaration] of functions) {
      if (!deferred.has(declaration)) continue;
      const captured = this.capturedLexicals(declaration, statements);
      const index =
        captured.length > 0 ? Math.max(...captured.map(lexicalIndex)) + 1 : 0;
      if (
        index > 0 &&
        this.reachedBefore(symbol, index, statements, functions)
      ) {
        assignAt.set(declaration, 0);
        captured.forEach((d) => hoistedLexicals.add(d));
      } else {
        assignAt.set(declaration, index);
      }
    }
    this.lexicalsCapturedBeforeDeclaration(statements, functions).forEach((d) =>
      hoistedLexicals.add(d),
    );
    return {
      assignAt,
      hoistedLexicals: [...hoistedLexicals].sort(
        (a, b) => a.getStart() - b.getStart(),
      ),
    };
  }

  /**
   * Whether a statement before `index` (other than a function declaration of the block)
   * refers to `symbol`, or to a function of the block that refers to it, transitively.
   */
  private reachedBefore(
    symbol: ts.Symbol,
    index: number,
    statements: readonly ts.Statement[],
    functions: ReadonlyMap<ts.Symbol, ts.FunctionDeclaration>,
  ): boolean {
    const reaching = new Set([symbol]);
    const pending = [symbol];
    while (pending.length > 0) {
      const callee = pending.pop()!;
      for (const [caller, declaration] of functions) {
        if (!reaching.has(caller) && this.refersTo(declaration, callee)) {
          reaching.add(caller);
          pending.push(caller);
        }
      }
    }
    const blockFunctions = new Set<ts.Statement>(functions.values());
    return statements
      .slice(0, index)
      .some(
        (statement) =>
          !blockFunctions.has(statement) &&
          [...reaching].some((s) => this.refersTo(statement, s)),
      );
  }

  /**
   * The `let`/`const`s of `statements` read by a closure (an arrow, a function expression
   * or a nested function) that appears before their declaration, outside the block's own
   * function declarations, which `deferredFunctions` places.
   */
  private lexicalsCapturedBeforeDeclaration(
    statements: readonly ts.Statement[],
    functions: ReadonlyMap<ts.Symbol, ts.FunctionDeclaration>,
  ): ts.VariableDeclaration[] {
    const blockFunctions = new Set<ts.Statement>(functions.values());
    const captured = new Set<ts.VariableDeclaration>();
    const visit = (node: ts.Node): void => {
      if (isFunctionLike(node)) {
        for (const declaration of this.capturedLexicals(node, statements)) {
          if (declaration.getStart() >= node.getEnd()) {
            captured.add(declaration);
          }
        }
        return;
      }
      ts.forEachChild(node, visit);
    };
    statements
      .filter((statement) => !blockFunctions.has(statement))
      .forEach(visit);
    return [...captured];
  }

  /** The `let`/`const` declarations of `statements` that `node` reads. */
  private capturedLexicals(
    node: ts.Node,
    statements: readonly ts.Statement[],
  ): ts.VariableDeclaration[] {
    const captured = new Set<ts.VariableDeclaration>();
    const visit = (child: ts.Node): void => {
      if (ts.isIdentifier(child)) {
        const declaration = this.valueSymbol(child)?.valueDeclaration;
        if (
          declaration &&
          ts.isVariableDeclaration(declaration) &&
          ts.isIdentifier(declaration.name) &&
          ts.isVariableDeclarationList(declaration.parent) &&
          !isVarDeclarationList(declaration.parent) &&
          ts.isVariableStatement(declaration.parent.parent) &&
          statements.includes(declaration.parent.parent)
        ) {
          captured.add(declaration);
        }
      }
      ts.forEachChild(child, visit);
    };
    visit(node);
    return [...captured];
  }

  /** The `var` a deferred function declaration becomes, and the closure it is assigned. */
  private deferredFunction(declaration: ts.FunctionDeclaration): {
    name: string;
    type: HxType;
    value: HxExpr;
  } {
    const name = this.localName(declaration.name!.text);
    if (declaration.typeParameters) {
      return {
        name,
        type: DYNAMIC,
        value: this.unsupported(
          declaration,
          'generic function declarations used before their declaration are not supported yet',
        ),
      };
    }
    const value = this.functionExpr(declaration, this.pos(declaration));
    return { name, type: value.type, value };
  }

  private body(statement: ts.Statement): HxStmt[] {
    return ts.isBlock(statement)
      ? this.block(statement.statements)
      : this.statement(statement);
  }

  private statement(node: ts.Statement): HxStmt[] {
    if (ts.isExpressionStatement(node)) {
      const converted: HxStmt = {
        kind: 'expr',
        expr: this.effect(node.expression),
      };
      const pending = this.pendingInits;
      return pending?.after === node
        ? [converted, ...pending.stmts]
        : [converted];
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
              name: this.localName(node.name.text),
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
    if (ts.isForInStatement(node)) {
      return this.forIn(node);
    }
    if (ts.isReturnStatement(node)) {
      return this.returnStatement(node);
    }
    if (ts.isBreakStatement(node)) {
      return [
        node.label
          ? { kind: 'labeledBreak', label: node.label.text }
          : { kind: 'break' },
      ];
    }
    if (ts.isContinueStatement(node)) {
      return [
        node.label
          ? { kind: 'labeledContinue', label: node.label.text }
          : { kind: 'continue' },
      ];
    }
    if (ts.isLabeledStatement(node)) {
      const body = this.statement(node.statement);
      return [
        {
          kind: 'labeled',
          label: node.label.text,
          body: body.length === 1 ? body[0] : { kind: 'block', body },
        },
      ];
    }
    if (ts.isSwitchStatement(node)) {
      return this.switchStatement(node);
    }
    return this.unsupportedStmt(node);
  }

  /** A `switch` whose clauses are tested with `===` against its subject, read once. */
  private switchStatement(node: ts.SwitchStatement): HxStmt[] {
    const { clauses } = node.caseBlock;
    const shared = clauses.some((clause) =>
      clause.statements.some(
        (statement) =>
          ts.isVariableStatement(statement) &&
          !isVarDeclarationList(statement.declarationList) &&
          statement.declarationList.declarations.some((declaration) => {
            const symbol = this.checker.getSymbolAtLocation(declaration.name);
            return (
              symbol &&
              clauses.some(
                (other) => other !== clause && this.refersTo(other, symbol),
              )
            );
          }),
      ),
    );
    if (shared) {
      return this.unsupportedStmt(
        node,
        'a let/const shared between switch clauses is not supported yet',
      );
    }
    const value = this.expression(node.expression);
    const name = this.freshName('switch');
    const subject = localExpr(name, value.type);
    return [
      {
        kind: 'tsSwitch',
        subject: { name, value },
        clauses: clauses.map((clause) => ({
          test: ts.isCaseClause(clause)
            ? this.equality(
                subject,
                this.expression(clause.expression),
                false,
                this.pos(clause),
              )
            : undefined,
          body: this.block(clause.statements),
        })),
      },
    ];
  }

  private returnStatement(node: ts.ReturnStatement): HxStmt[] {
    const ret = this.returnTypes[this.returnTypes.length - 1] ?? VOID;
    if (!sameType(ret, VOID)) {
      return [
        {
          kind: 'return',
          value: node.expression
            ? this.coerce(this.expression(node.expression), ret)
            : constExpr(null),
        },
      ];
    }
    const effect = node.expression && this.effect(node.expression);
    const exit: HxStmt =
      this.setterResult?.depth === this.returnTypes.length
        ? { kind: 'return', value: this.setterResult.value }
        : { kind: 'return' };
    return effect && !isPure(effect)
      ? [{ kind: 'expr', expr: effect }, exit]
      : [exit];
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
      const name = this.bindingName(declaration);
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
        this.valueSymbol(child) === symbol
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
            perIterationBindings.push(this.localName(symbol.name));
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
    const name = this.localName(symbol.name);
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

  /** `for (const k in dict)`: the dictionary's keys in JS order. */
  private forIn(node: ts.ForInStatement): HxStmt[] {
    const initializer = node.initializer;
    const iterated = this.expression(node.expression);
    if (
      !dictValue(iterated.type) ||
      !ts.isVariableDeclarationList(initializer) ||
      isVarDeclarationList(initializer) ||
      initializer.declarations.length !== 1 ||
      !ts.isIdentifier(initializer.declarations[0].name)
    ) {
      return this.unsupportedStmt(node);
    }
    const name = this.localName(initializer.declarations[0].name.text);
    const keys: HxExpr = {
      kind: 'call',
      callee: { kind: 'field', target: iterated, name: 'keys', type: DYNAMIC },
      args: [],
      type: arrayType(STRING),
    };
    const body = this.body(node.statement);
    if ((initializer.flags & ts.NodeFlags.Const) !== 0) {
      return [{ kind: 'forIn', name, iterable: keys, body }];
    }
    const element = this.freshName(name);
    return [
      {
        kind: 'forIn',
        name: element,
        iterable: keys,
        body: [
          {
            kind: 'var',
            name,
            final: false,
            type: STRING,
            init: localExpr(element, STRING),
          },
          ...body,
        ],
      },
    ];
  }

  // -------------------------------------------------------------- classes

  private inClass<T>(context: ClassContext, convert: () => T): T {
    this.classContexts.push(context);
    try {
      return convert();
    } finally {
      this.classContexts.pop();
    }
  }

  /**
   * A top-level class (ADR 0005): its Haxe class, plus the statements its non-constant
   * static initialisers and static blocks add to the module `__init()` in TS order.
   */
  private classDeclaration(node: ts.ClassDeclaration): {
    decl?: HxDecl;
    init: HxStmt[];
  } {
    const symbol = node.name && this.checker.getSymbolAtLocation(node.name);
    const path = symbol && this.types.classPath(symbol);
    if (!symbol || !path) {
      return {
        init: this.unsupportedStmt(
          node,
          'anonymous classes are not supported yet',
        ),
      };
    }
    const heritage = extendsClause(node);
    const base = heritage && this.types.map(this.typeOf(heritage));
    if (
      heritage &&
      (base?.kind !== 'path' || !this.classOf(heritage.expression))
    ) {
      return {
        init: this.unsupportedStmt(
          heritage,
          `extending ${heritage.expression.getText()} is not supported yet`,
        ),
      };
    }
    const instance: ClassContext = { path, isStatic: false };
    const statics: ClassContext = { path, isStatic: true };
    const fields: HxClassField[] = [];
    const inits: HxStmt[] = [];
    const init: HxStmt[] = [];
    const ctor = node.members.find(
      (m): m is ts.ConstructorDeclaration =>
        ts.isConstructorDeclaration(m) && m.body !== undefined,
    );
    for (const parameter of ctor?.parameters.filter(isParameterProperty) ??
      []) {
      const name = memberName(parameter, this.checker);
      if (!name || !ts.isIdentifier(parameter.name)) {
        inits.push(
          ...this.unsupportedStmt(
            parameter,
            'destructured parameter properties are not supported',
          ),
        );
        continue;
      }
      const type = this.instanceFieldType(parameter);
      fields.push(...this.instanceField(parameter, name, type));
      inits.push(
        this.thisAssignment(
          name,
          type,
          localExpr(this.localName(parameter.name.text), type),
        ),
      );
    }
    for (const member of node.members) {
      if (
        ts.isConstructorDeclaration(member) ||
        ts.isSemicolonClassElement(member) ||
        ts.isIndexSignatureDeclaration(member)
      ) {
        continue;
      }
      const name = memberName(member, this.checker);
      if (ts.isClassStaticBlockDeclaration(member)) {
        init.push({
          kind: 'block',
          body: this.inClass(statics, () => this.block(member.body.statements)),
        });
      } else if (name && ts.isAccessor(member)) {
        fields.push(
          ...this.accessor(
            node,
            member,
            name,
            isStatic(member) ? statics : instance,
          ),
        );
      } else if (!name) {
        this.unsupported(
          member,
          `${syntaxKindName(member.kind)} class members are not supported yet`,
        );
      } else if (ts.isPropertyDeclaration(member) && isStatic(member)) {
        const type = this.staticFieldType(member);
        const value =
          member.initializer &&
          this.inClass(statics, () =>
            this.coerce(this.expression(member.initializer!), type),
          );
        const constant = value !== undefined && isConstantInit(value);
        fields.push({
          kind: 'var',
          name,
          access: memberAccess(member),
          isStatic: true,
          final: constant && hasModifier(member, ts.ModifierFlags.Readonly),
          type,
          init: constant ? value : undefined,
        });
        if (value && !constant) {
          init.push({
            kind: 'expr',
            expr: {
              kind: 'assign',
              op: '=',
              target: { kind: 'staticField', owner: path, name, type },
              value,
              type,
            },
          });
        }
      } else if (ts.isPropertyDeclaration(member)) {
        const type = this.instanceFieldType(member);
        fields.push(...this.instanceField(member, name, type));
        if (member.initializer) {
          const value = this.inClass(instance, () =>
            this.coerce(this.expression(member.initializer!), type),
          );
          inits.push(this.thisAssignment(name, type, value));
        }
      } else if (ts.isMethodDeclaration(member)) {
        const method = this.method(
          member,
          name,
          isStatic(member) ? statics : instance,
        );
        if (method) fields.push(method);
      } else {
        this.unsupported(member);
      }
    }
    for (const [added, property] of structuralOptionalMembers(
      this.model.program,
    ).get(node) ?? []) {
      fields.push({
        kind: 'var',
        name: escapeIdentifier(added),
        access: 'public',
        isStatic: false,
        final: false,
        type: nullable(
          this.types.map(this.checker.getTypeOfSymbol(property)),
        ),
      });
    }
    const constructor = this.classConstructor(
      node,
      symbol,
      ctor,
      inits,
      base !== undefined,
      instance,
    );
    if (constructor) fields.unshift(constructor);
    return {
      decl: {
        kind: 'class',
        name: path.name,
        typeParams: (node.typeParameters ?? []).map((p) => ({
          name: escapeIdentifier(p.name.text),
          constraints: [],
        })),
        isAbstract: hasModifier(node, ts.ModifierFlags.Abstract),
        superClass:
          base?.kind === 'path'
            ? { path: base.path, params: base.params }
            : undefined,
        fields,
        meta: [],
      },
      init,
    };
  }

  /**
   * A `get`/`set` accessor: a `get_name`/`set_name` method, plus the Haxe property
   * on the first accessor of the topmost class declaring the name. A setter returns
   * the assigned value, as a JS assignment evaluates to it.
   */
  private accessor(
    node: ts.ClassDeclaration,
    member: ts.AccessorDeclaration,
    name: string,
    context: ClassContext,
  ): HxClassField[] {
    if (!ts.isIdentifier(member.name) && !ts.isStringLiteral(member.name)) {
      this.unsupported(member, 'private accessors are not supported yet');
      return [];
    }
    const sourceName = member.name.text;
    const kind = ts.isGetAccessor(member) ? 'get' : 'set';
    const pair = accessorPair(node, sourceName, context.isStatic);
    const inherited = context.isStatic
      ? undefined
      : inheritedAccessors(this.checker, node, sourceName);
    if (inherited === 'conflict') {
      this.unsupported(
        member,
        'an accessor overriding a field or method is not supported',
      );
      return [];
    }
    if (inherited && !inherited.pair[kind]) {
      this.unsupported(
        member,
        `a ${kind} accessor its base class lacks is not supported`,
      );
      return [];
    }
    const root = inherited ? (inherited.pair.get ?? inherited.pair.set)! : member;
    const type = this.types.map(
      this.checker.getTypeOfSymbol(
        this.checker.getSymbolAtLocation(root.name)!,
      ),
    );
    const fields: HxClassField[] = [];
    if (!inherited && member === (pair.get ?? pair.set)) {
      fields.push({
        kind: 'property',
        name,
        access: memberAccess(member),
        isStatic: context.isStatic,
        get: pair.get ? 'get' : 'never',
        set: pair.set ? 'set' : 'never',
        isVar: false,
        type,
      });
    }
    const isAbstract = hasModifier(member, ts.ModifierFlags.Abstract);
    if (!member.body && !isAbstract) {
      return fields;
    }
    const fn =
      kind === 'get'
        ? this.inClass(context, () => this.function(member))
        : this.setterFunction(member as ts.SetAccessorDeclaration, type, context);
    fields.push({
      kind: 'method',
      name: `${kind}_${name}`,
      access: 'public',
      isStatic: context.isStatic,
      isOverride:
        !!inherited &&
        overridesAccessor(this.checker, node, sourceName, kind),
      isAbstract,
      fn: isAbstract ? { ...fn, body: undefined } : fn,
    });
    return fields;
  }

  /** `set_name(__value)`: the TS setter body, returning the assigned value. */
  private setterFunction(
    member: ts.SetAccessorDeclaration,
    type: HxType,
    context: ClassContext,
  ): HxFunction {
    const value = localExpr(this.freshName('value'), type) as HxExpr & {
      kind: 'local';
    };
    const saved = this.setterResult;
    this.setterResult = { depth: this.returnTypes.length + 1, value };
    try {
      const fn = this.inClass(context, () => this.function(member));
      const [param] = fn.params;
      const prologue: HxStmt[] = param
        ? [{ kind: 'var', name: param.name, final: false, type, init: value }]
        : [];
      return {
        ...fn,
        params: [{ name: value.name, type }],
        ret: type,
        body: [...prologue, ...(fn.body ?? []), { kind: 'return', value }],
      };
    } finally {
      this.setterResult = saved;
    }
  }

  /** `this.name = value`. */
  private thisAssignment(name: string, type: HxType, value: HxExpr): HxStmt {
    return {
      kind: 'expr',
      expr: {
        kind: 'assign',
        op: '=',
        target: {
          kind: 'field',
          target: { kind: 'this', type: DYNAMIC },
          name,
          type,
        },
        value,
        type,
      },
    };
  }

  /**
   * The Haxe field of an instance property or parameter property; none when a
   * superclass already declares it (Haxe forbids redeclaring, TS only re-initialises).
   */
  private instanceField(
    field: FieldDeclaration,
    name: string,
    type: HxType,
  ): HxClassField[] {
    if (
      rootField(this.checker, field) !== field ||
      inheritsStructuralMember(this.model.program, owningClass(field), name)
    ) {
      return [];
    }
    return [
      {
        kind: 'var',
        name,
        access: memberAccess(field),
        isStatic: false,
        final: this.isFinalField(field, name),
        type,
      },
    ];
  }

  /**
   * A `readonly` field is Haxe `final` when it is assigned where Haxe can see it (an
   * initialiser, a parameter property, a top-level constructor assignment) and no
   * subclass redeclares and writes it.
   */
  private isFinalField(field: FieldDeclaration, name: string): boolean {
    if (
      !hasModifier(field, ts.ModifierFlags.Readonly) ||
      redeclaredWrittenFields(this.model.program).has(field)
    ) {
      return false;
    }
    const ctor = owningClass(field).members.find(
      (m): m is ts.ConstructorDeclaration =>
        ts.isConstructorDeclaration(m) && m.body !== undefined,
    );
    return (
      isParameterProperty(field) ||
      (ts.isPropertyDeclaration(field) && field.initializer !== undefined) ||
      assignsAtTopLevel(ctor, name)
    );
  }

  /**
   * Haxe type of an instance field, from its topmost declaration: `Null<T>` when
   * optional, or when superclass code may read it before it is initialised.
   */
  private instanceFieldType(field: FieldDeclaration): HxType {
    const root = rootField(this.checker, field);
    const type = this.types.map(this.typeOf(root));
    return root.questionToken || this.readsBeforeInit(root)
      ? nullable(type)
      : type;
  }

  /** Haxe type of a static field: `Null<T>` when it starts `undefined`. */
  private staticFieldType(field: ts.PropertyDeclaration): HxType {
    const type = this.types.map(this.typeOf(field));
    return field.questionToken || !field.initializer ? nullable(type) : type;
  }

  private method(
    member: ts.MethodDeclaration,
    name: string,
    context: ClassContext,
  ): HxClassField | undefined {
    const isAbstract = hasModifier(member, ts.ModifierFlags.Abstract);
    if (!member.body && !isAbstract) {
      return undefined;
    }
    const fn = this.inClass(context, () => this.function(member));
    return {
      kind: 'method',
      name,
      access: memberAccess(member),
      isStatic: context.isStatic,
      isOverride:
        !context.isStatic && overridesImplementation(this.checker, member),
      isAbstract,
      fn: isAbstract ? { ...fn, body: undefined } : fn,
    };
  }

  /**
   * `new`: the TS constructor with the field initialisers moved after its `super()`
   * call (TS order), or a generated one. A subclass without initialisers inherits
   * its parent's, as in Haxe.
   */
  private classConstructor(
    node: ts.ClassDeclaration,
    symbol: ts.Symbol,
    ctor: ts.ConstructorDeclaration | undefined,
    inits: HxStmt[],
    hasBase: boolean,
    context: ClassContext,
  ): HxClassField | undefined {
    const field = (fn: HxFunction): HxClassField => ({
      kind: 'method',
      name: 'new',
      access: 'public',
      isStatic: false,
      isOverride: false,
      isAbstract: false,
      fn,
    });
    if (ctor) {
      const after = hasBase ? superCallStatement(ctor) : undefined;
      if (hasBase && !after && inits.length > 0) {
        this.unsupported(
          ctor,
          'a constructor initialising fields needs a top-level super() call',
        );
      }
      this.pendingInits = { after, stmts: inits };
      try {
        return field(this.inClass(context, () => this.function(ctor)));
      } finally {
        this.pendingInits = undefined;
      }
    }
    if (!hasBase) {
      return field({ typeParams: [], params: [], ret: VOID, body: inits });
    }
    if (inits.length === 0) {
      return undefined;
    }
    const [signature] = this.checker
      .getTypeOfSymbol(symbol)
      .getConstructSignatures();
    const signatureType = signature && this.types.signatureType(signature);
    const args = signatureType?.kind === 'fn' ? signatureType.args : [];
    const params: HxParam[] = args.map((arg, i) => ({
      name: this.localName(arg.name ?? `arg${i}`),
      type: arg.optional && !arg.rest ? nullable(arg.type) : arg.type,
      optional: arg.optional,
      rest: arg.rest,
    }));
    const superCall: HxStmt = {
      kind: 'expr',
      expr: {
        kind: 'call',
        callee: { kind: 'super', type: DYNAMIC },
        args: params.map((p) => localExpr(p.name, p.type)),
        spreadLast: params[params.length - 1]?.rest,
        type: VOID,
      },
    };
    return field({
      typeParams: [],
      params,
      ret: VOID,
      body: [superCall, ...inits],
    });
  }

  /** The Haxe class a class reference (identifier, `ns.C`, import alias) names. */
  private classOf(node: ts.Expression): HxTypePath | undefined {
    const target = ts.isPropertyAccessExpression(node) ? node.name : node;
    let symbol = this.checker.getSymbolAtLocation(target);
    if (symbol && symbol.flags & ts.SymbolFlags.Alias) {
      symbol = this.checker.getAliasedSymbol(symbol);
    }
    return symbol && symbol.flags & ts.SymbolFlags.Class
      ? this.types.classPath(symbol)
      : undefined;
  }

  /**
   * A static member read through any class of the hierarchy, or `this` in a static
   * member: Haxe only resolves it on its declaring class.
   */
  private staticMember(
    node: ts.PropertyAccessExpression,
    pos: SourcePos,
  ): HxExpr | undefined {
    const symbol = this.checker.getSymbolAtLocation(node.name);
    const declaration = symbol?.valueDeclaration;
    if (
      !symbol ||
      !declaration ||
      !(
        ts.isPropertyDeclaration(declaration) ||
        ts.isMethodDeclaration(declaration) ||
        ts.isAccessor(declaration)
      ) ||
      !isStatic(declaration) ||
      !ts.isClassDeclaration(declaration.parent) ||
      !declaration.parent.name
    ) {
      return undefined;
    }
    const classSymbol = this.checker.getSymbolAtLocation(
      declaration.parent.name,
    );
    const owner = classSymbol && this.types.classPath(classSymbol);
    const name = memberName(declaration, this.checker);
    if (!owner || !name) {
      return undefined;
    }
    const type = ts.isPropertyDeclaration(declaration)
      ? this.staticFieldType(declaration)
      : this.types.map(this.checker.getTypeOfSymbol(symbol));
    return { kind: 'staticField', owner, name, type, pos };
  }

  private thisExpression(node: ts.Node, pos: SourcePos): HxExpr {
    const context = this.classContexts[this.classContexts.length - 1];
    if (!context) {
      return this.unsupported(node, '`this` outside a class is not supported');
    }
    return context.isStatic
      ? { kind: 'typeRef', path: context.path, type: DYNAMIC, pos }
      : { kind: 'this', type: this.hxTypeOf(node), pos };
  }

  private newExpression(node: ts.NewExpression, pos: SourcePos): HxExpr {
    const path = this.classOf(node.expression);
    const args = node.arguments ?? [];
    if (!path || args.some(ts.isSpreadElement)) {
      return this.unsupported(node);
    }
    return {
      kind: 'new',
      path,
      typeArgs: [],
      args: this.arguments(
        node,
        args.map((a) => this.expression(a)),
        false,
      ),
      type: this.hxTypeOf(node),
      pos,
    };
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
      const name = this.localName(parameter.name.text);
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
    const ret = ts.isConstructorDeclaration(node)
      ? VOID
      : signature
        ? this.types.mapReturn(signature.getReturnType())
        : DYNAMIC;
    this.returnTypes.push(ret);
    try {
      return {
        typeParams,
        params,
        ret,
        body: [...prologue, ...this.functionBody(node, ret)],
      };
    } finally {
      this.returnTypes.pop();
    }
  }

  private functionBody(node: FunctionNode, ret: HxType): HxStmt[] {
    const body = node.body;
    if (!body) {
      return [];
    }
    if (!ts.isBlock(body)) {
      return sameType(ret, VOID)
        ? [{ kind: 'expr', expr: this.effect(body) }]
        : [{ kind: 'return', value: this.coerce(this.expression(body), ret) }];
    }
    const pending = this.pendingInits;
    const inits =
      ts.isConstructorDeclaration(node) && pending && !pending.after
        ? pending.stmts
        : [];
    return [
      ...this.hoistVars(body.statements),
      ...inits,
      ...this.block(body.statements),
      ...this.implicitReturn(node, ret),
    ];
  }

  /** JS returns `undefined` when control reaches the end of a function body. */
  private implicitReturn(node: FunctionNode, ret: HxType): HxStmt[] {
    if (
      sameType(ret, VOID) ||
      (node.flags & ts.NodeFlags.HasImplicitReturn) === 0
    ) {
      return [];
    }
    return isNullable(ret)
      ? [{ kind: 'return', value: constExpr(null) }]
      : [{ kind: 'throw', value: constExpr('unreachable') }];
  }

  /** Declares a function's `var`s at its top, as JS hoists them. */
  private hoistVars(statements: readonly ts.Statement[]): HxStmt[] {
    return this.varDeclarations(statements, false).map((declaration) => {
      const symbol = this.checker.getSymbolAtLocation(declaration.name)!;
      this.hoisted.add(symbol);
      return {
        kind: 'var',
        name: this.localName(symbol.name),
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
    const nullishText =
      type.flags & ts.TypeFlags.Null
        ? 'null'
        : type.flags & (ts.TypeFlags.Undefined | ts.TypeFlags.Void)
          ? 'undefined'
          : undefined;
    if (
      expr.type.kind !== 'null' &&
      (everyConstituent(type, ts.TypeFlags.StringLike) ||
        (nullishText === undefined && isStringType(expr.type)))
    ) {
      return expr;
    }
    if (
      everyConstituent(type, ts.TypeFlags.NumberLike) &&
      expr.type.kind !== 'null'
    ) {
      return staticCall(RUNTIME.num, 'toString', [expr], STRING, expr.pos);
    }
    const converted = staticCall(
      RUNTIME.ts2hx,
      'string',
      [expr],
      STRING,
      expr.pos,
    );
    if (nullishText === undefined || !isPure(expr)) {
      return converted;
    }
    if (expr.kind === 'const') {
      return constExpr(nullishText, expr.pos);
    }
    return {
      kind: 'ternary',
      cond: {
        kind: 'binop',
        op: '==',
        left: expr,
        right: constExpr(null),
        type: BOOL,
        pos: expr.pos,
      },
      then: constExpr(nullishText, expr.pos),
      else: converted,
      type: STRING,
      pos: expr.pos,
    };
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
    if (everyConstituent(type, NULLISH_FLAGS)) {
      return expr.kind === 'const'
        ? constExpr(false, pos)
        : staticCall(RUNTIME.ts2hx, 'truthy', [expr], BOOL, pos);
    }
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

  /** Converts `node` as a value: a `Void` call reads as `undefined`. */
  expression(node: ts.Expression): HxExpr {
    const value = this.effect(node);
    if (!sameType(value.type, VOID)) {
      return value;
    }
    return {
      kind: 'blockExpr',
      stmts: [{ kind: 'expr', expr: value }],
      result: constExpr(null),
      type: DYNAMIC,
      pos: value.pos,
    };
  }

  /** Converts `node` for its side effects only: its value may be `Void`. */
  private effect(node: ts.Expression): HxExpr {
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
      case ts.SyntaxKind.ThisKeyword:
        return this.thisExpression(node, pos);
      case ts.SyntaxKind.SuperKeyword:
        return { kind: 'super', type: this.hxTypeOf(node), pos };
    }
    if (ts.isNonNullExpression(node) || ts.isSatisfiesExpression(node)) {
      return this.expression(node.expression);
    }
    if (ts.isAsExpression(node) || ts.isTypeAssertionExpression(node)) {
      const value = this.expression(node.expression);
      const type = this.hxTypeOf(node);
      return sameType(value.type, type) || type.kind === 'dynamic'
        ? value
        : { kind: 'cast', expr: value, checked: false, type, pos };
    }
    if (ts.isTemplateExpression(node)) {
      return this.template(node, pos);
    }
    if (ts.isIdentifier(node)) {
      return this.narrow(this.identifier(node, pos), node);
    }
    if (ts.isPropertyAccessExpression(node)) {
      return this.narrow(this.propertyAccess(node, pos), node);
    }
    if (ts.isElementAccessExpression(node)) {
      return this.narrow(this.elementAccess(node, pos), node);
    }
    if (ts.isDeleteExpression(node)) {
      return this.deleteExpression(node, pos);
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
    if (ts.isVoidExpression(node)) {
      const operand = this.effect(node.expression);
      return isPure(operand)
        ? constExpr(null, pos)
        : {
            kind: 'blockExpr',
            stmts: [{ kind: 'expr', expr: operand }],
            result: constExpr(null, pos),
            type: DYNAMIC,
            pos,
          };
    }
    if (ts.isCallExpression(node)) {
      return this.call(node, pos);
    }
    if (ts.isNewExpression(node)) {
      return this.newExpression(node, pos);
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

  /** The value an identifier reads: the variable, not the property, of a shorthand `{ x }`. */
  private valueSymbol(node: ts.Identifier): ts.Symbol | undefined {
    return ts.isShorthandPropertyAssignment(node.parent) &&
      node.parent.name === node
      ? this.checker.getShorthandAssignmentValueSymbol(node.parent)
      : this.checker.getSymbolAtLocation(node);
  }

  private identifier(node: ts.Identifier, pos: SourcePos): HxExpr {
    const symbol = this.valueSymbol(node);
    if (node.text === 'undefined' && !this.localDeclaration(symbol)) {
      return constExpr(null, pos);
    }
    const key = this.libKey(node, symbol);
    if (key !== undefined) {
      return VALUE_BINDINGS.get(key)?.(pos) ?? this.unsupported(node);
    }
    const classPath = this.classOf(node);
    if (classPath) {
      return { kind: 'typeRef', path: classPath, type: DYNAMIC, pos };
    }
    const value = symbol && this.model.resolveValue(symbol);
    if (value) {
      return this.moduleValue(node, value, pos);
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
      this.localName(symbol.name),
      ts.isVariableDeclaration(declaration)
        ? this.declaredType(declaration)
        : ts.isParameter(declaration)
          ? this.parameterType(declaration)
          : this.types.map(this.checker.getTypeOfSymbol(symbol)),
      pos,
    );
  }

  /**
   * A module-level value, possibly imported or re-exported: a bare name in its own
   * module, `pack.Module.name` elsewhere. Namespace objects only exist as `ns.member`.
   */
  private moduleValue(
    node: ts.Expression,
    value: ModuleValue,
    pos: SourcePos,
  ): HxExpr {
    if (value.kind === 'namespace') {
      return this.unsupported(
        node,
        'a module namespace object used as a value is not supported yet',
      );
    }
    const { declaration, module, name } = value;
    const type = ts.isVariableDeclaration(declaration)
      ? this.declaredType(declaration)
      : ts.isExportAssignment(declaration)
        ? this.hxTypeOf(declaration.expression)
        : this.hxTypeOf(declaration);
    return module === this.info
      ? localExpr(name, type, pos)
      : { kind: 'moduleField', module: module.path, name, type, pos };
  }

  /** The project module an `import * as ns` (or re-exported namespace) expression names. */
  private isNamespace(node: ts.Expression): boolean {
    const target = ts.isPropertyAccessExpression(node) ? node.name : node;
    const symbol = this.checker.getSymbolAtLocation(target);
    return (
      (ts.isIdentifier(node) || ts.isPropertyAccessExpression(node)) &&
      !!symbol &&
      this.model.resolveValue(symbol)?.kind === 'namespace'
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
    if (this.isNamespace(node.expression)) {
      const symbol = this.checker.getSymbolAtLocation(node.name);
      const value = symbol && this.model.resolveValue(symbol);
      return value
        ? this.moduleValue(node, value, pos)
        : this.unsupported(node);
    }
    const key = this.libKey(node.name);
    if (key !== undefined) {
      const property = PROPERTY_BINDINGS.get(key);
      if (property) {
        return property(this.expression(node.expression), pos);
      }
      return VALUE_BINDINGS.get(key)?.(pos) ?? this.unsupported(node);
    }
    if (node.questionDotToken) {
      return this.unsupported(node);
    }
    const member = this.staticMember(node, pos);
    if (member) {
      return member;
    }
    const symbol = this.checker.getSymbolAtLocation(node.name);
    if (
      symbol &&
      symbol.flags & ts.SymbolFlags.Accessor &&
      !(symbol.declarations ?? []).every(
        (d) => ts.isAccessor(d) && ts.isClassLike(d.parent),
      )
    ) {
      return this.unsupported(node, 'accessors are not supported yet');
    }
    const target = this.expression(node.expression);
    if (dictValue(target.type)) {
      return this.dictGet(target, constExpr(node.name.text, pos), pos);
    }
    const name = ts.isPrivateIdentifier(node.name)
      ? symbol?.valueDeclaration &&
        memberName(symbol.valueDeclaration, this.checker)
      : escapeIdentifier(node.name.text);
    if (name === undefined) {
      return this.unsupported(node);
    }
    return {
      kind: 'field',
      target,
      name,
      type: this.fieldType(target, node),
      pos,
    };
  }

  /**
   * Haxe type of a field read: the property's declared type, or `Dynamic` when the
   * target is (Haxe resolves the field at run time); `narrow` applies flow types.
   */
  private fieldType(
    target: HxExpr,
    node: ts.PropertyAccessExpression | ts.ElementAccessExpression,
  ): HxType {
    const targetType =
      target.type.kind === 'null' ? target.type.inner : target.type;
    if (targetType.kind === 'dynamic' || sameType(targetType, ANY)) {
      return DYNAMIC;
    }
    const symbol = this.checker.getSymbolAtLocation(
      ts.isPropertyAccessExpression(node) ? node.name : node.argumentExpression,
    );
    if (!symbol) {
      return this.hxTypeOf(node);
    }
    const type = this.types.map(this.checker.getTypeOfSymbol(symbol));
    const declaration = symbol.valueDeclaration;
    if (
      declaration &&
      isFieldDeclaration(declaration) &&
      this.readsBeforeInit(declaration)
    ) {
      return explicitlyNullable(type);
    }
    return symbol.flags & ts.SymbolFlags.Optional ? nullable(type) : type;
  }

  /** Whether superclass code may read the field while it is still `undefined`. */
  private readsBeforeInit(field: FieldDeclaration): boolean {
    return mayReadFieldsBeforeInit(
      this.checker,
      owningClass(rootField(this.checker, field)),
    );
  }

  private dictGet(dict: HxExpr, key: HxExpr, pos: SourcePos): HxExpr {
    return {
      kind: 'call',
      callee: { kind: 'field', target: dict, name: 'get', type: DYNAMIC, pos },
      args: [key],
      type: nullable(dictValue(dict.type) ?? DYNAMIC),
      pos,
    };
  }

  /** JS property key of an index expression: numbers convert to their string form. */
  private propertyKey(node: ts.Expression): HxExpr {
    return this.stringOf(node);
  }

  /** `Int` index of an array element access (ADR 0002: `Int` only at index sites). */
  private arrayIndex(node: ts.Expression): HxExpr | undefined {
    if (!this.isNumberLike(node)) {
      return undefined;
    }
    const index = this.expression(node);
    if (
      index.kind === 'const' &&
      typeof index.value === 'number' &&
      Number.isInteger(index.value) &&
      index.value >= 0 &&
      index.value <= 0x7fffffff
    ) {
      return { ...index, int: true, type: INT };
    }
    return staticCall(STD, 'int', [index], INT, index.pos);
  }

  /** `a[i]` on arrays and tuples, `d[k]` on dictionaries, `o["name"]` on structures. */
  private elementAccess(
    node: ts.ElementAccessExpression,
    pos: SourcePos,
    assigned = false,
  ): HxExpr {
    if (node.questionDotToken) {
      return this.unsupported(node);
    }
    const target = this.expression(node.expression);
    if (dictValue(target.type)) {
      return this.dictGet(
        target,
        this.propertyKey(node.argumentExpression),
        pos,
      );
    }
    if (isArray(target.type)) {
      const index = this.arrayIndex(node.argumentExpression);
      if (!index) return this.unsupported(node);
      const element = target.type.params[0];
      const read: HxExpr = { kind: 'index', target, index, type: element, pos };
      const type = this.hxTypeOf(node);
      return !assigned && element.kind === 'dynamic' && type.kind !== 'dynamic'
        ? { kind: 'cast', expr: read, checked: false, type, pos }
        : read;
    }
    const argument = node.argumentExpression;
    if (
      (ts.isStringLiteral(argument) ||
        ts.isNoSubstitutionTemplateLiteral(argument)) &&
      !this.isStringLike(node.expression) &&
      this.checker.getSymbolAtLocation(argument) !== undefined
    ) {
      return {
        kind: 'field',
        target,
        name: escapeIdentifier(argument.text),
        type: this.fieldType(target, node),
        pos,
      };
    }
    return this.unsupported(node);
  }

  private deleteExpression(node: ts.DeleteExpression, pos: SourcePos): HxExpr {
    let operand: ts.Expression = node.expression;
    while (ts.isParenthesizedExpression(operand)) operand = operand.expression;
    if (
      !ts.isPropertyAccessExpression(operand) &&
      !ts.isElementAccessExpression(operand)
    ) {
      return this.unsupported(node);
    }
    const target = this.expression(operand.expression);
    const key = ts.isPropertyAccessExpression(operand)
      ? ts.isPrivateIdentifier(operand.name)
        ? undefined
        : constExpr(operand.name.text, pos)
      : this.isNumberLike(operand.argumentExpression) && isArray(target.type)
        ? undefined
        : this.propertyKey(operand.argumentExpression);
    if (!key) return this.unsupported(node);
    if (dictValue(target.type)) {
      return {
        kind: 'call',
        callee: { kind: 'field', target, name: 'remove', type: DYNAMIC, pos },
        args: [key],
        type: BOOL,
        pos,
      };
    }
    if (isArray(target.type)) return this.unsupported(node);
    return staticCall(REFLECT, 'deleteField', [target, key], BOOL, pos);
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
      return target.kind === 'field' || target.kind === 'staticField'
        ? target
        : undefined;
    }
    if (ts.isElementAccessExpression(node)) {
      const target = this.elementAccess(node, this.pos(node), true);
      return target.kind === 'field' || target.kind === 'index'
        ? target
        : undefined;
    }
    return undefined;
  }

  /** `d[k] = v` / `d.k = v` on a dictionary: `d.set(k, v)`, which evaluates to `v`. */
  private dictAssign(
    node: ts.BinaryExpression,
    pos: SourcePos,
    operator?: ts.BinaryOperator,
  ): HxExpr | undefined {
    let left = node.left;
    while (ts.isParenthesizedExpression(left) || ts.isNonNullExpression(left)) {
      left = left.expression;
    }
    if (
      !ts.isPropertyAccessExpression(left) &&
      !ts.isElementAccessExpression(left)
    ) {
      return undefined;
    }
    if (
      ts.isPropertyAccessExpression(left) &&
      this.libKey(left.name) !== undefined
    ) {
      return undefined;
    }
    if (!this.isDict(left.expression)) {
      return undefined;
    }
    const target = this.expression(left.expression);
    const key = ts.isPropertyAccessExpression(left)
      ? constExpr(left.name.text, pos)
      : this.propertyKey(left.argumentExpression);
    if (operator === undefined) {
      return this.dictSet(target, key, this.expression(node.right), pos);
    }
    const dict = this.once(target);
    const name = this.once(key);
    const current = this.dictGet(dict.ref, name.ref, pos);
    const updated = this.operation(operator, left, node.right, pos, current);
    return updated
      ? this.withStmts(
          [...dict.stmts, ...name.stmts],
          this.dictSet(dict.ref, name.ref, updated, pos),
        )
      : this.unsupported(node);
  }

  private dictSet(
    dict: HxExpr,
    key: HxExpr,
    value: HxExpr,
    pos: SourcePos,
  ): HxExpr {
    const type = dictValue(dict.type) ?? DYNAMIC;
    return {
      kind: 'call',
      callee: { kind: 'field', target: dict, name: 'set', type: DYNAMIC, pos },
      args: [key, this.coerce(value, type)],
      type,
      pos,
    };
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
      case ts.SyntaxKind.InKeyword:
        return this.inExpression(node, pos);
      case ts.SyntaxKind.InstanceOfKeyword:
        return this.instanceOf(node, pos);
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

  /** `key in object`: `Dict.exists` on dictionaries, `Reflect.hasField` on structures. */
  private inExpression(node: ts.BinaryExpression, pos: SourcePos): HxExpr {
    if (ts.isPrivateIdentifier(node.left)) {
      return this.unsupported(node);
    }
    const key = this.propertyKey(node.left);
    const target = this.expression(node.right);
    if (dictValue(target.type)) {
      return {
        kind: 'call',
        callee: { kind: 'field', target, name: 'exists', type: DYNAMIC, pos },
        args: [key],
        type: BOOL,
        pos,
      };
    }
    if (isArray(target.type) || this.isStringLike(node.right)) {
      return this.unsupported(node);
    }
    return staticCall(REFLECT, 'hasField', [target, key], BOOL, pos);
  }

  /** `x instanceof C` for project classes and the lib classes Haxe has a runtime type of (`Array`). */
  private instanceOf(node: ts.BinaryExpression, pos: SourcePos): HxExpr {
    const key = ts.isIdentifier(node.right)
      ? this.libKey(node.right)
      : undefined;
    const path =
      key === 'Array' ? typePath([], 'Array') : this.classOf(node.right);
    if (!path) {
      return this.unsupported(
        node,
        'instanceof is only supported for project classes and Array yet',
      );
    }
    return {
      kind: 'isOfType',
      expr: this.expression(node.left),
      path,
      type: BOOL,
      pos,
    };
  }

  private assign(node: ts.BinaryExpression, pos: SourcePos): HxExpr {
    const dict = this.dictAssign(node, pos);
    if (dict) {
      return dict;
    }
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
    const dict = this.dictAssign(node, pos, operator);
    if (dict) {
      return dict;
    }
    const target = this.lvalue(node.left);
    if (!target) {
      return this.unsupported(node);
    }
    const floatOp = FLOAT_OPERATORS.get(operator);
    const numeric =
      this.isNumberLike(node.left) && this.isNumberLike(node.right);
    if (floatOp && numeric) {
      return compoundExpr(
        target,
        floatOp,
        this.expression(node.right),
        FLOAT,
        pos,
        this.isModuleVar(node.left) && isValueUsed(node),
      );
    }
    if (operator === ts.SyntaxKind.PlusToken && this.isStringLike(node.left)) {
      return compoundExpr(
        target,
        '+',
        this.stringOf(node.right),
        STRING,
        pos,
        this.isModuleVar(node.left) && isValueUsed(node),
      );
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

  /** Whether `node` names a variable declared outside every function: a Haxe module var. */
  private isModuleVar(node: ts.Expression): boolean {
    const declaration =
      ts.isIdentifier(node) && this.localDeclaration(this.valueSymbol(node));
    return (
      !!declaration &&
      ts.isVariableDeclaration(declaration) &&
      !ts.findAncestor(declaration, isFunctionLike)
    );
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
        this.branch(this.expression(e), element),
      ),
      type,
      pos,
    };
  }

  private objectLiteral(
    node: ts.ObjectLiteralExpression,
    pos: SourcePos,
  ): HxExpr {
    const contextual = this.checker.getContextualType(node);
    const dictValueType =
      contextual &&
      this.types.dictValueType(this.checker.getNonNullableType(contextual));
    if (dictValueType) {
      return this.dictLiteral(node, this.types.map(dictValueType), pos);
    }
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

  /** An object literal typed as a dictionary: `Dict.of(keys, values)` in source order. */
  private dictLiteral(
    node: ts.ObjectLiteralExpression,
    value: HxType,
    pos: SourcePos,
  ): HxExpr {
    const keys: HxExpr[] = [];
    const values: HxExpr[] = [];
    for (const property of node.properties) {
      const name = property.name;
      const key =
        name &&
        (ts.isIdentifier(name) ||
          ts.isStringLiteral(name) ||
          ts.isNumericLiteral(name))
          ? name.text
          : undefined;
      if (key === undefined) {
        return this.unsupported(node);
      }
      keys.push(
        constExpr(ts.isNumericLiteral(name!) ? String(Number(key)) : key, pos),
      );
      if (ts.isPropertyAssignment(property)) {
        values.push(this.coerce(this.expression(property.initializer), value));
      } else if (
        ts.isShorthandPropertyAssignment(property) &&
        !property.objectAssignmentInitializer
      ) {
        values.push(this.coerce(this.expression(property.name), value));
      } else if (ts.isMethodDeclaration(property) && !property.asteriskToken) {
        values.push(
          this.coerce(this.functionExpr(property, this.pos(property)), value),
        );
      } else {
        return this.unsupported(node);
      }
    }
    const type = dictType(value);
    if (keys.length === 0) {
      return {
        kind: 'new',
        path: RUNTIME.dict,
        typeArgs: [value],
        args: [],
        type,
        pos,
      };
    }
    return staticCall(
      RUNTIME.dict,
      'of',
      [
        { kind: 'arrayLit', elements: keys, type: arrayType(STRING), pos },
        { kind: 'arrayLit', elements: values, type: arrayType(value), pos },
      ],
      type,
      pos,
    );
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
    if (node.questionDotToken) {
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
    return {
      kind: 'call',
      callee: this.expression(callee),
      args: this.arguments(node, args, spreadLast),
      spreadLast,
      type: ret,
      pos,
    };
  }

  /** Call or `new` arguments typed as the resolved signature's parameters. */
  private arguments(
    node: ts.CallLikeExpression,
    args: HxExpr[],
    spreadLast: boolean,
  ): HxExpr[] {
    const signature = this.checker.getResolvedSignature(node);
    const parameterTypes = signature
      ? (this.types.signatureType(signature) as Extract<HxType, { kind: 'fn' }>)
          .args
      : [];
    return args.map((arg, i) => {
      const parameter = parameterTypes[Math.min(i, parameterTypes.length - 1)];
      return parameter && !(spreadLast && i === args.length - 1)
        ? this.coerce(
            arg,
            parameter.optional ? nullable(parameter.type) : parameter.type,
          )
        : arg;
    });
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
