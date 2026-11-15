import ts from 'typescript';

import { printType } from '../printer/printer';
import { padCallback } from '../stdlib/callbacks';
import {
  ANY,
  arrayType,
  sameTypePath,
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
  HxCatch,
  HxClassField,
  HxDecl,
  HxExpr,
  HxFunction,
  HxModule,
  HxParam,
  HxStmt,
  HxType,
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
  bindingElements,
  isAmbient,
  namespaceStatements,
} from '../model/project-model';
import {
  enumAbstract,
  enumMembers,
  enumObjectEntries,
  reverseMappingName,
} from './enums';
import {
  type BoundReceiver,
  CALL_BINDINGS,
  PROPERTY_BINDINGS,
  stdlibKey,
  VALUE_BINDINGS,
} from '../stdlib/bindings';
import { newPromise } from '../stdlib/promise-bindings';
import { arrayConstructor, setArrayLength } from '../stdlib/array-bindings';
import {
  ERROR_FIELD_NAMES,
  ERROR_PROPERTIES,
  libErrorClassPath,
} from '../stdlib/errors';
import { ExternRegistry, NPM_SHIMS, npmImportOf } from '../stdlib/npm';
import {
  isRegExpIterator,
  REGEXP_WRITABLE_PROPERTIES,
  regExpIteratorArray,
  regExpLiteral,
} from '../stdlib/regexp-bindings';
import { stringCodePoints, stringIndex } from '../stdlib/string-bindings';
import {
  accessorPair,
  assignsAtTopLevel,
  inheritedAccessors,
  inheritedStaticDivergence,
  overridesAccessor,
  privateMemberName,
  extendsClause,
  extendsLibError,
  type FieldDeclaration,
  hasModifier,
  isFieldDeclaration,
  isParameterProperty,
  isStatic,
  mayReadFieldsBeforeInit,
  redeclaredWrittenFields,
  boundClassExpression,
  isHoistedClass,
  staticThisClass,
  structuralAccessorMembers,
  structuralMemberConflicts,
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
  /** The lib or npm member without a binding, for the per-run summary. */
  member?: string;
}

/** An npm package, or one of its members, named by an import of this module. */
interface NpmReference {
  pkg: string;
  member?: string;
  /** The node whose symbol declares the member, for its extern. */
  memberNode?: ts.Node;
}

const EXTERN_PRIMITIVES = new Set(['Float', 'Int', 'Bool', 'String', 'Void']);

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

function arrayElement(type: HxType): HxType {
  return isArray(type) ? type.params[0] : DYNAMIC;
}

/**
 * A nested array literal takes the element type its outer literal expects, so
 * `[[1, 2], [3, [4]]]` builds `Array<Dynamic>` rows on every target.
 */
function retypeArrayLiteral(value: HxExpr, expected: HxType): HxExpr {
  if (
    value.kind !== 'arrayLit' ||
    !isArray(expected) ||
    sameType(value.type, expected)
  ) {
    return value;
  }
  const element = expected.params[0];
  if (element.kind !== 'dynamic') {
    return value;
  }
  return {
    ...value,
    type: expected,
    elements: value.elements.map((e) =>
      e.type.kind === 'dynamic'
        ? e
        : { kind: 'cast', expr: e, checked: false, type: DYNAMIC },
    ),
  };
}

/** A run of plain elements, or one spread array of an array literal. */
type ArraySegment =
  | { spread: false; value: HxExpr[] }
  | { spread: true; value: HxExpr; fresh: boolean };

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

/**
 * Whether a method is declared to return `this`: Haxe types the call as the declaring
 * class, so the result is cast to the receiver's class.
 */
function returnsThis(signature: ts.Signature | undefined): boolean {
  const type = signature?.declaration?.type;
  return type !== undefined && type.kind === ts.SyntaxKind.ThisType;
}

/** Whether every constituent, or the primitive constraint of a type parameter, has `flags`. */
function everyConstituent(type: ts.Type, flags: ts.TypeFlags): boolean {
  return constituents(type).every((t) => {
    if (t.flags & flags) return true;
    const constraint =
      t.flags & ts.TypeFlags.TypeParameter ? t.getConstraint() : undefined;
    return (
      constraint !== undefined &&
      !(constraint.flags & ts.TypeFlags.TypeParameter) &&
      everyConstituent(constraint, flags)
    );
  });
}

/** Expressions that can be read twice without repeating a side effect. */
function isPure(expr: HxExpr): boolean {
  switch (expr.kind) {
    case 'const':
    case 'local':
    case 'staticField':
    case 'typeRef':
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
 * Whether a `String`-typed expression may still be `undefined` at run time, which
 * TS lets through unsoundly (a field read before init, an out-of-range element).
 */
function mayHoldUndefined(expr: HxExpr): boolean {
  switch (expr.kind) {
    case 'local':
    case 'field':
    case 'staticField':
    case 'moduleField':
    case 'index':
    case 'cast':
      return true;
    case 'call':
      return !(
        expr.callee.kind === 'staticField' &&
        expr.callee.owner.pack[0] === RUNTIME.ts2hx.pack[0]
      );
    case 'ternary':
      return mayHoldUndefined(expr.then) || mayHoldUndefined(expr.else);
    case 'blockExpr':
      return mayHoldUndefined(expr.result);
    case 'assign':
      return mayHoldUndefined(expr.value);
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

/** Whether `key` is a project property (`undefined`) or a lib property Haxe can assign. */
function isWritableLibProperty(key: string | undefined): boolean {
  return (
    key === undefined ||
    ERROR_PROPERTIES.has(key) ||
    REGEXP_WRITABLE_PROPERTIES.has(key)
  );
}

/** A declaration binding one name: a variable or an element of a destructuring pattern. */
type Binding = ts.VariableDeclaration | ts.BindingElement;

/** The declaration a binding element belongs to: the variable, parameter or catch binding holding its pattern. */
function rootDeclaration(node: Binding): ts.Node {
  let current: ts.Node = node;
  while (
    ts.isBindingElement(current) ||
    ts.isObjectBindingPattern(current) ||
    ts.isArrayBindingPattern(current)
  ) {
    current = current.parent;
  }
  return current;
}

function isVarBinding(node: Binding): boolean {
  const root = rootDeclaration(node);
  return (
    ts.isVariableDeclaration(root) &&
    ts.isVariableDeclarationList(root.parent) &&
    isVarDeclarationList(root.parent)
  );
}

function intConst(value: number, pos?: SourcePos): HxExpr {
  return { kind: 'const', value, int: true, type: INT, pos };
}

function unwrapParens(node: ts.Expression): ts.Expression {
  while (ts.isParenthesizedExpression(node)) node = node.expression;
  return node;
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
  /** Locals a hoisted class captures, read from the instance field they are copied to. */
  captures?: ReadonlyMap<ts.Symbol, Capture>;
  /** In a constructor: the captures read from its capture parameters, set before the fields are. */
  captureLocals?: ReadonlyMap<ts.Symbol, HxExpr>;
  /** In a constructor: the captures `super(...)` passes first to a hoisted base class. */
  superCaptures?: HxExpr[];
}

/** A local a hoisted class captures: passed to its constructor, kept in `field`. */
interface Capture {
  symbol: ts.Symbol;
  declaration: ts.Declaration;
  field: string;
  type: HxType;
  /** Captured by a hoisted base class, which declares `field` and receives it through `super`. */
  inherited?: boolean;
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
    hasModifier(member, ts.ModifierFlags.Private | ts.ModifierFlags.Protected)
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

/** The function or class whose `this` a `this` keyword denotes: arrows are transparent. */
function thisContainer(node: ts.Node): ts.Node | undefined {
  return ts.findAncestor(
    node.parent,
    (n) =>
      (ts.isFunctionLike(n) && !ts.isArrowFunction(n)) ||
      ts.isClassLike(n) ||
      ts.isPropertyDeclaration(n) ||
      ts.isClassStaticBlockDeclaration(n),
  );
}

/** Whether a function body reads its own `this` (arrows included, nested functions not). */
function usesThis(body: ts.Node): boolean {
  const visit = (n: ts.Node): boolean =>
    n.kind === ts.SyntaxKind.ThisKeyword ||
    (!(ts.isFunctionLike(n) && !ts.isArrowFunction(n)) &&
      !ts.isClassLike(n) &&
      (ts.forEachChild(n, visit) ?? false));
  return ts.forEachChild(body, visit) ?? false;
}

/** The node a local is scoped to: its block, function, loop or source file. */
function scopeOf(declaration: ts.Declaration): ts.Node | undefined {
  return ts.findAncestor(
    declaration.parent,
    (n) =>
      ts.isBlock(n) ||
      ts.isSourceFile(n) ||
      ts.isFunctionLike(n) ||
      ts.isCaseBlock(n) ||
      ts.isIterationStatement(n, false),
  );
}

/** Whether a local is assigned after its declaration (`=`, compound, `++`/`--`). */
function isReassigned(
  checker: ts.TypeChecker,
  symbol: ts.Symbol,
  declaration: ts.Declaration,
): boolean {
  if (
    ts.isVariableDeclaration(declaration) &&
    ts.isVariableDeclarationList(declaration.parent) &&
    declaration.parent.flags & ts.NodeFlags.Const
  ) {
    return false;
  }
  const writes = (n: ts.Node): boolean => {
    const target =
      ts.isBinaryExpression(n) &&
      n.operatorToken.kind >= ts.SyntaxKind.FirstAssignment &&
      n.operatorToken.kind <= ts.SyntaxKind.LastAssignment
        ? n.left
        : (ts.isPrefixUnaryExpression(n) || ts.isPostfixUnaryExpression(n)) &&
            (n.operator === ts.SyntaxKind.PlusPlusToken ||
              n.operator === ts.SyntaxKind.MinusMinusToken)
          ? n.operand
          : undefined;
    return (
      (!!target &&
        ts.isIdentifier(target) &&
        checker.getSymbolAtLocation(target) === symbol) ||
      (ts.forEachChild(n, writes) ?? false)
    );
  };
  const scope = scopeOf(declaration);
  return !!scope && writes(scope);
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
  /** Classes hoisted out of functions and expressions, declared after the module's own. */
  private readonly hoistedDecls: HxDecl[] = [];
  /** The local an object literal is bound to while its methods read `this`. */
  private readonly objectSelves = new Map<ts.ObjectLiteralExpression, HxExpr>();
  /** Links of the optional chain being converted, read as plain accesses. */
  private readonly chainMembers = new Set<ts.Node>();
  /** The guarded value of each `?.` being converted, already checked for null. */
  private readonly chainValues = new Map<ts.Node, HxExpr>();
  private readonly captureCache = new Map<
    ts.ClassLikeDeclaration,
    Capture[] | undefined
  >();
  /** The value a setter returns, for `return;` at its `returnTypes` depth. */
  private setterResult?: { depth: number; value: HxExpr & { kind: 'local' } };
  private tempCounter = 0;

  constructor(
    private readonly model: ProjectModel,
    private readonly info: ModuleInfo,
    private readonly report: (unsupported: UnsupportedReport) => void,
    private readonly externs = new ExternRegistry(),
  ) {
    this.checker = model.checker;
    this.sourceFile = info.sourceFile;
    this.types = new TypeMapper(
      this.checker,
      (sourceFile) => model.moduleOf(sourceFile)?.path,
      (node) => {
        const module = model.moduleOf(node.getSourceFile());
        const name = module?.hoistedClasses.get(node);
        return module && name
          ? { pack: module.path.pack, module: module.path.module, name }
          : undefined;
      },
      (declaration) =>
        model.moduleOf(declaration.getSourceFile())?.types.get(declaration),
    );
  }

  convert(): HxModule {
    const decls: HxDecl[] = this.types.typedefs(this.sourceFile);
    for (const declaration of this.varDeclarations(
      this.sourceFile.statements,
      true,
    )) {
      if (
        ts.isVariableDeclaration(declaration) &&
        boundClassExpression(declaration)
      ) {
        continue;
      }
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
      } else if (ts.isEnumDeclaration(statement)) {
        init.push(...this.enumDeclaration(statement, decls));
      } else if (ts.isModuleDeclaration(statement)) {
        init.push(...this.namespaceDeclaration(statement, decls));
      } else {
        init.push(...this.statement(statement));
      }
    }
    return {
      pack: this.info.path.pack,
      name: this.info.path.module,
      sourceFile: this.sourceFile.fileName,
      imports: [],
      decls: [...decls, ...this.hoistedDecls],
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
  private bindingName(declaration: Binding): string {
    return (
      this.info.fields.get(declaration) ??
      this.info.statics.get(declaration)?.name ??
      this.localName((declaration.name as ts.Identifier).text)
    );
  }

  /** What assigning a hoisted binding writes: a namespace static, or the module field or local. */
  private bindingTarget(declaration: Binding, type: HxType): HxExpr {
    const member = this.info.statics.get(declaration);
    return member
      ? {
          kind: 'staticField',
          owner: this.ownType(member.owner),
          name: member.name,
          type,
        }
      : localExpr(this.bindingName(declaration), type);
  }

  /** The path of a type this module declares. */
  private ownType(name: string): HxTypePath {
    return { pack: this.info.path.pack, module: this.info.path.module, name };
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

  private unsupported(
    node: ts.Node,
    message?: string,
    member?: string,
  ): HxExpr {
    const text = message ?? `${syntaxKindName(node.kind)} is not supported yet`;
    const pos = this.pos(node);
    this.report({ message: text, pos, member });
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
  private declaredType(declaration: Binding): HxType {
    const symbol = this.checker.getSymbolAtLocation(declaration.name);
    const type = symbol
      ? this.types.map(this.checker.getTypeOfSymbol(symbol))
      : DYNAMIC;
    return isVarBinding(declaration) ||
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
  ): Binding[] {
    const result: Binding[] = [];
    const visit = (node: ts.Node, topLevel: boolean): void => {
      if (isFunctionLike(node)) {
        return;
      }
      if (ts.isVariableDeclarationList(node)) {
        if (isVarDeclarationList(node) || (moduleLevel && topLevel)) {
          result.push(
            ...node.declarations.flatMap((d): Binding[] =>
              ts.isIdentifier(d.name) ? [d] : bindingElements(d.name),
            ),
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
    if (ts.isClassDeclaration(node)) {
      return this.hoistClass(node);
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
    if (ts.isThrowStatement(node)) {
      return [{ kind: 'throw', value: this.expression(node.expression) }];
    }
    if (ts.isTryStatement(node)) {
      return this.tryStatement(node);
    }
    if (
      (ts.isEnumDeclaration(node) || ts.isModuleDeclaration(node)) &&
      isAmbient(node)
    ) {
      return [];
    }
    return this.unsupportedStmt(node);
  }

  /** `try`/`catch` maps to Haxe's; a `finally` is left to the `lowerFinally` pass. */
  private tryStatement(node: ts.TryStatement): HxStmt[] {
    const body = this.block(node.tryBlock.statements);
    const handler = node.catchClause && this.catchClause(node.catchClause);
    if (!node.finallyBlock) {
      return [{ kind: 'try', body, catches: handler ? [handler] : [] }];
    }
    return [
      {
        kind: 'tryFinally',
        body,
        catch: handler,
        finally: this.block(node.finallyBlock.statements),
      },
    ];
  }

  /**
   * A `catch` of any value: Haxe catches it as `Dynamic`, and the binding gets the
   * JS value of it (`ts2hx.Error.caught` maps native runtime errors).
   */
  private catchClause(clause: ts.CatchClause): HxCatch {
    const name = this.freshName('caught');
    const declaration = clause.variableDeclaration;
    const caught = staticCall(
      RUNTIME.error,
      'caught',
      [localExpr(name, DYNAMIC)],
      DYNAMIC,
      this.pos(clause),
    );
    const binding: HxStmt[] = !declaration
      ? []
      : ts.isIdentifier(declaration.name)
        ? [
            {
              kind: 'var',
              name: this.bindingName(declaration),
              final: false,
              type: this.declaredType(declaration),
              init: caught,
            },
          ]
        : this.bindPattern(declaration.name, caught, false);
    return {
      name,
      type: DYNAMIC,
      body: [...binding, ...this.block(clause.block.statements)],
    };
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
        return declaration.initializer
          ? this.bindPattern(
              declaration.name,
              this.expression(declaration.initializer),
              isConst,
            )
          : this.unsupportedStmt(declaration);
      }
      const classExpression = boundClassExpression(declaration);
      if (classExpression) {
        return this.hoistClass(classExpression);
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
                  target: this.bindingTarget(declaration, type),
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

  // -------------------------------------------------------- destructuring

  /**
   * `value` read once: a temporary unless it is a local, a constant or `this`.
   * Unlike `once`, a literal is stored too, since a pattern may assign what it reads.
   */
  private stored(
    value: HxExpr,
    hint: string,
    type: HxType = value.type,
  ): { ref: HxExpr; stmts: HxStmt[] } {
    if (
      (value.kind === 'local' ||
        value.kind === 'const' ||
        value.kind === 'this') &&
      sameType(type, value.type)
    ) {
      return { ref: value, stmts: [] };
    }
    const name = this.freshName(hint);
    return {
      ref: localExpr(name, type, value.pos),
      stmts: [{ kind: 'var', name, final: true, type, init: value }],
    };
  }

  /** The TS type of property `key` of `type`, nullable parts aside. */
  private propertyTsType(type: ts.Type, key: string): ts.Type | undefined {
    const property = this.checker.getPropertyOfType(
      this.checker.getNonNullableType(type),
      key,
    );
    return property && this.checker.getTypeOfSymbol(property);
  }

  /** The TS type of element `index` of an array or tuple type. */
  private elementTsType(type: ts.Type, index: number): ts.Type | undefined {
    const source = this.checker.getNonNullableType(type);
    if (this.checker.isTupleType(source)) {
      return this.checker.getTypeArguments(source as ts.TypeReference)[index];
    }
    return this.checker.getIndexTypeOfType(source, ts.IndexKind.Number);
  }

  /** `source.key` as a pattern reads it: a dictionary lookup or a field typed from the checker. */
  private readProperty(
    source: HxExpr,
    sourceType: ts.Type,
    key: string,
    pos: SourcePos,
  ): HxExpr {
    if (dictValue(source.type)) {
      return this.dictGet(source, constExpr(key, pos), pos);
    }
    const propertyType = this.propertyTsType(sourceType, key);
    const target =
      source.type.kind === 'null' ? source.type.inner : source.type;
    return {
      kind: 'field',
      target: source,
      name: escapeIdentifier(key),
      type:
        target.kind === 'dynamic' || !propertyType
          ? DYNAMIC
          : this.types.map(propertyType),
      pos,
    };
  }

  /**
   * `source[index]` as a pattern reads it. With a default, an index past the end
   * reads `null`, which a static target's typed array would not give.
   */
  private readIndex(
    source: HxExpr,
    sourceType: ts.Type,
    index: number,
    hasDefault: boolean,
    pos: SourcePos,
  ): HxExpr | undefined {
    const target =
      source.type.kind === 'null' ? source.type.inner : source.type;
    if (!isArray(target) && target.kind !== 'dynamic') {
      return undefined;
    }
    const element = isArray(target) ? target.params[0] : DYNAMIC;
    const elementType = this.elementTsType(sourceType, index);
    const wanted = elementType ? this.types.map(elementType) : element;
    const read: HxExpr = {
      kind: 'index',
      target: source,
      index: intConst(index, pos),
      type: element,
      pos,
    };
    const value =
      element.kind === 'dynamic' && wanted.kind !== 'dynamic'
        ? this.coerce(read, wanted)
        : read;
    if (!hasDefault) {
      return value;
    }
    const type = nullable(value.type);
    return {
      kind: 'ternary',
      cond: {
        kind: 'binop',
        op: '<',
        left: intConst(index, pos),
        right: { kind: 'field', target: source, name: 'length', type: INT },
        type: BOOL,
        pos,
      },
      then: this.coerce(value, type),
      else: constExpr(null, pos),
      type,
      pos,
    };
  }

  /** `source.slice(index)`: the rest of an array pattern, typed as `restType`. */
  private readRest(
    source: HxExpr,
    index: number,
    restType: ts.Type,
    pos: SourcePos,
  ): HxExpr | undefined {
    const target =
      source.type.kind === 'null' ? source.type.inner : source.type;
    if (!isArray(target) && target.kind !== 'dynamic') {
      return undefined;
    }
    const rest: HxExpr = {
      kind: 'call',
      callee: { kind: 'field', target: source, name: 'slice', type: DYNAMIC },
      args: [intConst(index, pos)],
      type: target,
      pos,
    };
    const type = this.types.map(restType);
    return sameType(type, target)
      ? rest
      : { kind: 'cast', expr: rest, checked: false, type, pos };
  }

  /** The rest of an object pattern: a fresh structure with the fields of `restType`, read from `source`. */
  private readObjectRest(
    source: HxExpr,
    sourceType: ts.Type,
    restType: ts.Type,
    pos: SourcePos,
  ): HxExpr | undefined {
    if (dictValue(source.type)) {
      return undefined;
    }
    return {
      kind: 'objectLit',
      fields: this.checker
        .getPropertiesOfType(this.checker.getNonNullableType(restType))
        .map((property) => ({
          name: escapeIdentifier(property.name),
          value: this.readProperty(source, sourceType, property.name, pos),
        })),
      type: this.types.map(restType),
      pos,
    };
  }

  /** `value`, or the default `initializer` when it is `null`/`undefined` (ADR 0002 merges them). */
  private withDefault(
    value: HxExpr,
    initializer: ts.Expression | undefined,
    type: HxType,
  ): HxExpr {
    if (!initializer) {
      return value;
    }
    const { ref, stmts } = this.stored(value, 'default', nullable(value.type));
    return this.withStmts(stmts, {
      kind: 'ternary',
      cond: {
        kind: 'binop',
        op: '==',
        left: ref,
        right: constExpr(null),
        type: BOOL,
      },
      then: this.branch(this.expression(initializer), type),
      else: this.branch(ref, type),
      type,
      pos: value.pos,
    });
  }

  /** A property name of a pattern as a JS key, or `undefined` when it is computed. */
  private patternKey(name: ts.PropertyName): string | undefined {
    if (
      ts.isIdentifier(name) ||
      ts.isStringLiteral(name) ||
      ts.isNoSubstitutionTemplateLiteral(name)
    ) {
      return name.text;
    }
    return ts.isNumericLiteral(name) ? String(Number(name.text)) : undefined;
  }

  /** Declares (or assigns, when hoisted) the names of a binding pattern from the parts of `value`. */
  private bindPattern(
    pattern: ts.BindingPattern,
    value: HxExpr,
    isConst: boolean,
  ): HxStmt[] {
    const sourceType = this.typeOf(pattern);
    const { ref, stmts } = this.stored(value, 'pattern');
    pattern.elements.forEach((element, index) => {
      if (ts.isOmittedExpression(element)) {
        return;
      }
      const pos = this.pos(element);
      let read: HxExpr | undefined;
      if (ts.isArrayBindingPattern(pattern)) {
        read = element.dotDotDotToken
          ? this.readRest(ref, index, this.typeOf(element.name), pos)
          : this.readIndex(ref, sourceType, index, !!element.initializer, pos);
      } else if (element.dotDotDotToken) {
        read = this.readObjectRest(
          ref,
          sourceType,
          this.typeOf(element.name),
          pos,
        );
      } else {
        const key = this.patternKey(
          element.propertyName ?? (element.name as ts.Identifier),
        );
        read =
          key === undefined
            ? undefined
            : this.readProperty(ref, sourceType, key, pos);
      }
      if (!read) {
        stmts.push(...this.unsupportedStmt(element));
        return;
      }
      if (ts.isIdentifier(element.name)) {
        const type = this.declaredType(element);
        stmts.push(
          ...this.bindName(
            element,
            this.withDefault(read, element.initializer, type),
            isConst,
          ),
        );
        return;
      }
      const type = this.types.map(this.typeOf(element.name));
      stmts.push(
        ...this.bindPattern(
          element.name,
          this.withDefault(read, element.initializer, type),
          isConst,
        ),
      );
    });
    return stmts;
  }

  /** `var name = value`, or `name = value` for a binding declared up front (`var`, module level). */
  private bindName(
    element: Binding,
    value: HxExpr,
    isConst: boolean,
  ): HxStmt[] {
    const symbol = this.checker.getSymbolAtLocation(element.name);
    const name = this.bindingName(element);
    const type = this.declaredType(element);
    const init = this.coerce(value, type);
    if (symbol && this.hoisted.has(symbol)) {
      return [
        {
          kind: 'expr',
          expr: {
            kind: 'assign',
            op: '=',
            target: this.bindingTarget(element, type),
            value: init,
            type,
          },
        },
      ];
    }
    return [{ kind: 'var', name, final: isConst, type, init }];
  }

  /** `[a, b] = v` / `({ a, b } = v)`: assigns each target in turn; the expression's value is `v`. */
  private destructuringAssign(
    pattern: ts.ArrayLiteralExpression | ts.ObjectLiteralExpression,
    value: HxExpr,
    sourceType: ts.Type,
    pos: SourcePos,
  ): HxExpr {
    const { ref, stmts } = this.assignPattern(pattern, value, sourceType);
    return { kind: 'blockExpr', stmts, result: ref, type: ref.type, pos };
  }

  private assignPattern(
    pattern: ts.ArrayLiteralExpression | ts.ObjectLiteralExpression,
    value: HxExpr,
    sourceType: ts.Type,
  ): { ref: HxExpr; stmts: HxStmt[] } {
    const { ref, stmts } = this.stored(value, 'pattern');
    const assignTo = (
      target: ts.Expression,
      read: HxExpr | undefined,
      readType: ts.Type | undefined,
      initializer?: ts.Expression,
    ): void => {
      target = unwrapParens(target);
      if (!read) {
        stmts.push(...this.unsupportedStmt(target));
        return;
      }
      if (
        ts.isArrayLiteralExpression(target) ||
        ts.isObjectLiteralExpression(target)
      ) {
        const nested = this.typeOf(target);
        const value = this.withDefault(
          read,
          initializer,
          this.types.map(readType ?? nested),
        );
        stmts.push(
          ...this.assignPattern(
            target,
            value,
            this.checker.getNonNullableType(readType ?? nested),
          ).stmts,
        );
        return;
      }
      stmts.push({
        kind: 'expr',
        expr: this.assignValue(target, (type) =>
          this.withDefault(read, initializer, type),
        ),
      });
    };
    if (ts.isArrayLiteralExpression(pattern)) {
      pattern.elements.forEach((element, index) => {
        const pos = this.pos(element);
        if (ts.isOmittedExpression(element)) {
          return;
        }
        if (ts.isSpreadElement(element)) {
          assignTo(
            element.expression,
            this.readRest(ref, index, this.typeOf(element.expression), pos),
            sourceType,
          );
          return;
        }
        const withDefault =
          ts.isBinaryExpression(element) &&
          element.operatorToken.kind === ts.SyntaxKind.EqualsToken;
        assignTo(
          withDefault ? element.left : element,
          this.readIndex(ref, sourceType, index, withDefault, pos),
          this.elementTsType(sourceType, index),
          withDefault ? element.right : undefined,
        );
      });
      return { ref, stmts };
    }
    for (const property of pattern.properties) {
      const pos = this.pos(property);
      if (ts.isSpreadAssignment(property)) {
        assignTo(
          property.expression,
          this.readObjectRest(
            ref,
            sourceType,
            this.typeOf(property.expression),
            pos,
          ),
          undefined,
        );
        continue;
      }
      const key = property.name && this.patternKey(property.name);
      const read =
        key === undefined
          ? undefined
          : this.readProperty(ref, sourceType, key, pos);
      const readType =
        key === undefined ? undefined : this.propertyTsType(sourceType, key);
      if (ts.isShorthandPropertyAssignment(property)) {
        assignTo(
          property.name,
          read,
          readType,
          property.objectAssignmentInitializer,
        );
      } else if (ts.isPropertyAssignment(property)) {
        const initializer = property.initializer;
        const withDefault =
          ts.isBinaryExpression(initializer) &&
          initializer.operatorToken.kind === ts.SyntaxKind.EqualsToken;
        assignTo(
          withDefault ? initializer.left : initializer,
          read,
          readType,
          withDefault ? initializer.right : undefined,
        );
      } else {
        stmts.push(...this.unsupportedStmt(property));
      }
    }
    return { ref, stmts };
  }

  /** `target = value` for a destructuring target: a binding, a field, an element or a dictionary entry. */
  private assignValue(
    target: ts.Expression,
    value: (type: HxType) => HxExpr,
  ): HxExpr {
    const pos = this.pos(target);
    let node = target;
    while (ts.isParenthesizedExpression(node) || ts.isNonNullExpression(node)) {
      node = node.expression;
    }
    if (
      (ts.isPropertyAccessExpression(node) ||
        ts.isElementAccessExpression(node)) &&
      !(ts.isPropertyAccessExpression(node) && this.libKey(node.name)) &&
      this.isDict(node.expression)
    ) {
      const dict = this.expression(node.expression);
      const key = ts.isPropertyAccessExpression(node)
        ? constExpr(node.name.text, pos)
        : this.propertyKey(node.argumentExpression);
      return this.dictSet(
        dict,
        key,
        value(dictValue(dict.type) ?? DYNAMIC),
        pos,
      );
    }
    const lvalue = this.lvalue(target);
    if (!lvalue || lvalue.kind === 'unsupported') {
      return lvalue ?? this.unsupported(target);
    }
    return {
      kind: 'assign',
      op: '=',
      target: lvalue,
      value: this.coerce(value(lvalue.type), lvalue.type),
      type: lvalue.type,
      pos,
    };
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
    const overString = this.isStringLike(node.expression);
    if (
      node.awaitModifier ||
      (!this.checker.isArrayType(iterated) &&
        !this.checker.isTupleType(iterated) &&
        !overString &&
        !isRegExpIterator(this.types.map(iterated))) ||
      (ts.isVariableDeclarationList(initializer) &&
        initializer.declarations.length !== 1)
    ) {
      return this.unsupportedStmt(node);
    }
    if (
      !ts.isVariableDeclarationList(initializer) ||
      !ts.isIdentifier(initializer.declarations[0].name)
    ) {
      return this.forOfPattern(node, initializer, overString);
    }
    const declaration = initializer.declarations[0];
    const symbol = this.checker.getSymbolAtLocation(declaration.name)!;
    const name = this.localName(symbol.name);
    const isConst = (initializer.flags & ts.NodeFlags.Const) !== 0;
    const body = this.body(node.statement);
    const iterable = this.iterated(
      this.expression(node.expression),
      overString,
    );
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

  /** The array `for…of` iterates: a string's code points, the matches of `matchAll`, or the array itself. */
  private iterated(source: HxExpr, overString: boolean): HxExpr {
    if (overString) return stringCodePoints(source);
    return isRegExpIterator(source.type) ? regExpIteratorArray(source) : source;
  }

  /** `for (const [k, v] of xs)` / `for ([a, b] of xs)`: each element bound at the top of the body. */
  private forOfPattern(
    node: ts.ForOfStatement,
    initializer: ts.ForInitializer,
    overString: boolean,
  ): HxStmt[] {
    const iterable = this.iterated(
      this.expression(node.expression),
      overString,
    );
    const element = localExpr(
      this.freshName('item'),
      overString ? STRING : arrayElement(iterable.type),
    );
    let bind: HxStmt[];
    if (ts.isVariableDeclarationList(initializer)) {
      bind = this.bindPattern(
        initializer.declarations[0].name as ts.BindingPattern,
        element,
        (initializer.flags & ts.NodeFlags.Const) !== 0,
      );
    } else {
      const target = unwrapParens(initializer);
      const elementType = overString
        ? this.checker.getStringType()
        : this.checker.getIndexTypeOfType(
            this.checker.getNonNullableType(this.typeOf(node.expression)),
            ts.IndexKind.Number,
          );
      bind =
        (ts.isArrayLiteralExpression(target) ||
          ts.isObjectLiteralExpression(target)) &&
        elementType
          ? this.assignPattern(target, element, elementType).stmts
          : [{ kind: 'expr', expr: this.assignValue(target, () => element) }];
    }
    return [
      {
        kind: 'forIn',
        name: (element as { name: string }).name,
        iterable,
        body: [...bind, ...this.body(node.statement)],
      },
    ];
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
   * An enum's `enum abstract` (ADR 0005), declared with its first declaration. A
   * computed member is reported where it stands and left out.
   */
  private enumDeclaration(node: ts.EnumDeclaration, decls: HxDecl[]): HxStmt[] {
    const name = this.info.types.get(node);
    if (name === undefined) {
      return isAmbient(node)
        ? []
        : this.unsupportedStmt(node, 'this enum merge is not supported');
    }
    const symbol = this.checker.getSymbolAtLocation(node.name)!;
    if (symbol.declarations?.find(ts.isEnumDeclaration) !== node) {
      return [];
    }
    const members = enumMembers(symbol, this.checker);
    decls.push(enumAbstract(name, members, this.info.statics));
    return members
      .filter((m) => m.value === undefined)
      .flatMap((m) =>
        this.unsupportedStmt(
          m.member,
          'computed enum members are not supported',
        ),
      );
  }

  /**
   * A namespace (ADR 0005): its values and functions become statics of a class (the
   * class it merges with, or one of its own); its statements run where it stands.
   */
  private namespaceDeclaration(
    node: ts.ModuleDeclaration,
    decls: HxDecl[],
  ): HxStmt[] {
    const owner = this.info.types.get(node);
    if (owner === undefined) {
      return isAmbient(node)
        ? []
        : this.unsupportedStmt(node, 'this namespace merge is not supported');
    }
    const fields: HxClassField[] = [];
    const init: HxStmt[] = [];
    for (const statement of namespaceStatements(node)) {
      if (ts.isVariableStatement(statement)) {
        for (const declaration of this.varDeclarations([statement], true)) {
          const member = this.info.statics.get(declaration);
          if (!member) continue;
          this.hoisted.add(this.checker.getSymbolAtLocation(declaration.name)!);
          fields.push({
            kind: 'var',
            name: member.name,
            access: 'public',
            isStatic: true,
            final: false,
            type: this.declaredType(declaration),
          });
        }
        init.push(...this.statement(statement));
      } else if (ts.isFunctionDeclaration(statement)) {
        const member = this.info.statics.get(statement);
        if (!member) continue;
        fields.push({
          kind: 'method',
          name: member.name,
          access: 'public',
          isStatic: true,
          isOverride: false,
          isAbstract: false,
          fn: this.function(statement),
        });
      } else if (ts.isModuleDeclaration(statement)) {
        init.push(...this.namespaceDeclaration(statement, decls));
      } else if (ts.isEnumDeclaration(statement)) {
        init.push(...this.enumDeclaration(statement, decls));
      } else {
        init.push(...this.statement(statement));
      }
    }
    const existing = decls.find(
      (d): d is Extract<HxDecl, { kind: 'class' }> =>
        d.kind === 'class' && d.name === owner,
    );
    if (existing) {
      existing.fields.push(...fields);
    } else {
      decls.push({
        kind: 'class',
        name: owner,
        typeParams: [],
        isAbstract: false,
        fields,
        meta: [],
      });
    }
    return init;
  }

  /**
   * A top-level class (ADR 0005): its Haxe class, plus the statements its non-constant
   * static initialisers and static blocks add to the module `__init()` in TS order.
   */
  private classDeclaration(
    node: ts.ClassLikeDeclaration,
    captures: Capture[] = [],
  ): {
    decl?: HxDecl;
    init: HxStmt[];
  } {
    const symbol = this.classSymbol(node);
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
    const captured = new Map(captures.map((c) => [c.symbol, c]));
    const instance: ClassContext = {
      path,
      isStatic: false,
      captures: captured,
    };
    const statics: ClassContext = { path, isStatic: true, captures: captured };
    const own = captures.filter((c) => !c.inherited);
    const fields: HxClassField[] = own.map((c): HxClassField => ({
      kind: 'var',
      name: c.field,
      access: 'private',
      isStatic: false,
      final: false,
      type: c.type,
    }));
    const captureParams: HxParam[] = captures.map((c) => ({
      name: this.freshName(c.symbol.name),
      type: c.type,
    }));
    const captureLocals = new Map(
      captures.map((c, i) => [
        c.symbol,
        localExpr(captureParams[i].name, c.type),
      ]),
    );
    const inits: HxStmt[] = own.map((c) =>
      this.thisAssignment(c.field, c.type, captureLocals.get(c.symbol)!),
    );
    const constructorContext: ClassContext = {
      ...instance,
      captureLocals,
      superCaptures: captures
        .filter((c) => c.inherited)
        .map((c) => captureLocals.get(c.symbol)!),
    };
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
      const firstField = fields.length;
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
      const decorated = fields[firstField];
      const meta = this.decoratorMeta(member);
      if (decorated && meta.length > 0) {
        decorated.meta = [...(decorated.meta ?? []), ...meta];
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
        type: nullable(this.types.map(this.checker.getTypeOfSymbol(property))),
      });
    }
    for (const conflict of structuralMemberConflicts(this.model.program).get(
      node,
    ) ?? []) {
      this.unsupported(
        node,
        `optional member ${conflict} is not added, as a subclass declares it as a method or accessor: reading it on this class fails on C#`,
      );
    }
    const constructor = this.classConstructor(
      node,
      symbol,
      ctor,
      inits,
      base !== undefined,
      constructorContext,
    );
    if (constructor?.kind === 'method') {
      constructor.fn = {
        ...constructor.fn,
        params: [...captureParams, ...constructor.fn.params],
      };
    }
    if (constructor) fields.unshift(constructor);
    return {
      decl: {
        kind: 'class',
        name: path.name,
        typeParams: this.types.typeParams(node),
        isAbstract: hasModifier(node, ts.ModifierFlags.Abstract),
        superClass:
          base?.kind === 'path'
            ? { path: base.path, params: base.params }
            : undefined,
        fields,
        meta: this.decoratorMeta(node),
      },
      init,
    };
  }

  /** Decorators are not executed (ADR 0005): a `TODO(ts2hx)` comment plus `@:ts.decorator` metadata each. */
  private decoratorMeta(node: ts.Node): string[] {
    const decorators = ts.canHaveDecorators(node)
      ? (ts.getDecorators(node) ?? [])
      : [];
    return decorators.flatMap((decorator) => {
      const text = decorator.expression
        .getText(this.sourceFile)
        .replace(/\s+/g, ' ');
      this.report({
        message: `decorator @${text} is not executed`,
        pos: this.pos(decorator),
      });
      return [
        `// TODO(ts2hx): decorator @${text} is not executed`,
        `@:ts.decorator(${JSON.stringify(text)})`,
      ];
    });
  }

  /**
   * A `get`/`set` accessor: a `get_name`/`set_name` method, plus the Haxe property
   * on the first accessor of the topmost class declaring the name. A setter returns
   * the assigned value, as a JS assignment evaluates to it.
   */
  private accessor(
    node: ts.ClassLikeDeclaration,
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
    const root = inherited
      ? (inherited.pair.get ?? inherited.pair.set)!
      : member;
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
        : this.setterFunction(
            member as ts.SetAccessorDeclaration,
            type,
            context,
          );
    fields.push({
      kind: 'method',
      name: `${kind}_${name}`,
      access: 'public',
      isStatic: context.isStatic,
      isOverride:
        !!inherited && overridesAccessor(this.checker, node, sourceName, kind),
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
      inheritsStructuralMember(this.model.program, owningClass(field), name) ||
      (ERROR_FIELD_NAMES.has(name) &&
        extendsLibError(this.checker, owningClass(field)))
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
    node: ts.ClassLikeDeclaration,
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
      const outer = this.pendingInits;
      this.pendingInits = { after, stmts: inits };
      try {
        return field(this.inClass(context, () => this.function(ctor)));
      } finally {
        this.pendingInits = outer;
      }
    }
    if (!hasBase) {
      return field({ typeParams: [], params: [], ret: VOID, body: inits });
    }
    const superCaptures = context.superCaptures ?? [];
    if (inits.length === 0 && superCaptures.length === 0) {
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
        args: [
          ...superCaptures,
          ...params.map((p) => localExpr(p.name, p.type)),
        ],
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
    const symbol = this.classSymbolOf(node);
    return symbol ? this.types.classPath(symbol) : this.errorClassOf(node);
  }

  /** The `ts2hx.Error` class a reference to a lib error constructor (`RangeError`) names. */
  private errorClassOf(node: ts.Expression): HxTypePath | undefined {
    if (!ts.isIdentifier(node)) {
      return undefined;
    }
    const symbol = this.checker.getSymbolAtLocation(node);
    const resolved =
      symbol && symbol.flags & ts.SymbolFlags.Alias
        ? this.checker.getAliasedSymbol(symbol)
        : symbol;
    return resolved && libErrorClassPath(resolved);
  }

  /** The class symbol a class reference names, a `const` bound to a class expression included. */
  private classSymbolOf(node: ts.Expression): ts.Symbol | undefined {
    const target = ts.isPropertyAccessExpression(node) ? node.name : node;
    let symbol = this.checker.getSymbolAtLocation(target);
    if (symbol && symbol.flags & ts.SymbolFlags.Alias) {
      symbol = this.checker.getAliasedSymbol(symbol);
    }
    const bound =
      symbol?.valueDeclaration && boundClassExpression(symbol.valueDeclaration);
    if (bound) {
      return this.classSymbol(bound);
    }
    return symbol && symbol.flags & ts.SymbolFlags.Class ? symbol : undefined;
  }

  private classSymbol(node: ts.ClassLikeDeclaration): ts.Symbol | undefined {
    if (node.name) {
      return this.checker.getSymbolAtLocation(node.name);
    }
    const type = this.checker.getTypeAtLocation(node);
    const parts = type.isIntersection() ? type.types : [type];
    return parts
      .map((part) => part.getSymbol())
      .find((symbol) => symbol?.declarations?.includes(node));
  }

  /**
   * A class expression or local class: declared at module level (ADR 0005), its static
   * initialisers left in place. The locals it captures are passed to its constructor.
   */
  private hoistClass(node: ts.ClassLikeDeclaration): HxStmt[] {
    const captures = this.captures(node);
    if (!captures) {
      return this.unsupportedStmt(
        node,
        'a class capturing a reassigned local is not supported',
      );
    }
    const converted = this.classDeclaration(node, captures);
    if (converted.decl) this.hoistedDecls.push(converted.decl);
    return converted.init;
  }

  /**
   * The locals of enclosing functions a hoisted class reads, in order of first use;
   * `undefined` when one is reassigned, as the class only keeps a copy.
   */
  private captures(node: ts.ClassLikeDeclaration): Capture[] | undefined {
    if (this.captureCache.has(node)) {
      return this.captureCache.get(node);
    }
    const symbol = this.classSymbol(node);
    const path = symbol && this.types.classPath(symbol);
    const inherited = this.baseCaptures(node);
    if (!inherited) {
      this.captureCache.set(node, undefined);
      return undefined;
    }
    const result: Capture[] = inherited.map((c) => ({ ...c, inherited: true }));
    const seen = new Set<ts.Symbol>(inherited.map((c) => c.symbol));
    let reassigned = false;
    const visit = (n: ts.Node): void => {
      if (ts.isIdentifier(n)) {
        const local =
          ts.isShorthandPropertyAssignment(n.parent) && n.parent.name === n
            ? this.checker.getShorthandAssignmentValueSymbol(n.parent)
            : this.checker.getSymbolAtLocation(n);
        const declaration = local?.valueDeclaration;
        if (
          local &&
          declaration &&
          !seen.has(local) &&
          local.flags & (ts.SymbolFlags.Variable | ts.SymbolFlags.Function) &&
          !(local.flags & ts.SymbolFlags.Property) &&
          (ts.isVariableDeclaration(declaration) ||
            ts.isParameter(declaration) ||
            ts.isFunctionDeclaration(declaration)) &&
          declaration.getSourceFile() === node.getSourceFile() &&
          !(declaration.pos >= node.pos && declaration.end <= node.end) &&
          !boundClassExpression(declaration) &&
          !this.model.resolveValue(local)
        ) {
          seen.add(local);
          reassigned ||= isReassigned(this.checker, local, declaration);
          result.push({
            symbol: local,
            declaration,
            field: `__${path?.name ?? 'Class'}_${local.name}`,
            type: ts.isVariableDeclaration(declaration)
              ? this.declaredType(declaration)
              : ts.isParameter(declaration)
                ? this.parameterType(declaration)
                : this.types.map(this.checker.getTypeOfSymbol(local)),
          });
        }
      }
      ts.forEachChild(n, visit);
    };
    ts.forEachChild(node, visit);
    const captures = reassigned ? undefined : result;
    this.captureCache.set(node, captures);
    return captures;
  }

  /** The captures of the hoisted class `node` extends, which its constructor forwards to `super`. */
  private baseCaptures(node: ts.ClassLikeDeclaration): Capture[] | undefined {
    const heritage = extendsClause(node);
    const base =
      heritage &&
      this.classSymbolOf(heritage.expression)?.declarations?.find(
        isHoistedClass,
      );
    return base ? this.captures(base) : [];
  }

  /**
   * A captured local inside a hoisted class: the field its constructor copied it to,
   * or in the constructor the capture parameter, as the field is set only after `super()`.
   */
  private capturedLocal(
    node: ts.Node,
    symbol: ts.Symbol,
    pos?: SourcePos,
  ): HxExpr | undefined {
    const context = this.classContexts[this.classContexts.length - 1];
    const capture = context?.captures?.get(symbol);
    if (!context || !capture) {
      return undefined;
    }
    const local = context.captureLocals?.get(symbol);
    if (local) {
      return { ...local, pos };
    }
    if (context.isStatic) {
      return this.unsupported(
        node,
        'a static member reading a captured local is not supported',
      );
    }
    return {
      kind: 'field',
      target: { kind: 'this', type: DYNAMIC },
      name: capture.field,
      type: capture.type,
      pos,
    };
  }

  /** The values `new` passes for a hoisted class's captures; `undefined` out of their scope. */
  private captureArguments(
    node: ts.NewExpression,
    symbol: ts.Symbol | undefined,
    pos: SourcePos,
  ): HxExpr[] | string {
    const declaration = symbol?.declarations?.find(isHoistedClass);
    if (!declaration) {
      return [];
    }
    const captures = this.captures(declaration);
    if (!captures) {
      return 'constructing a class that is not supported';
    }
    if (
      captures.some(
        (c) => !ts.findAncestor(node, (n) => n === scopeOf(c.declaration)),
      )
    ) {
      return 'constructing a class outside the scope of the locals it captures is not supported';
    }
    return captures.map(
      (c) =>
        this.capturedLocal(node, c.symbol, pos) ??
        localExpr(this.localName(c.symbol.name), c.type, pos),
    );
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
    const divergence = this.inheritedStaticDivergence(node, classSymbol);
    if (divergence) {
      return this.unsupported(node, divergence);
    }
    const type = ts.isPropertyDeclaration(declaration)
      ? this.staticFieldType(declaration)
      : this.types.map(this.checker.getTypeOfSymbol(symbol));
    return { kind: 'staticField', owner, name, type, pos };
  }

  /** Why a static access through a subclass of `owner` cannot be rewritten to `owner`. */
  private inheritedStaticDivergence(
    node: ts.PropertyAccessExpression,
    owner: ts.Symbol,
  ): string | undefined {
    const thisClass =
      node.expression.kind === ts.SyntaxKind.ThisKeyword
        ? staticThisClass(node.expression)
        : undefined;
    const receiver = thisClass
      ? this.classSymbol(thisClass)
      : this.classSymbolOf(node.expression);
    return receiver && receiver !== owner
      ? inheritedStaticDivergence(
          this.checker,
          node,
          this.checker.getTypeOfSymbol(receiver),
        )
      : undefined;
  }

  private thisExpression(node: ts.Node, pos: SourcePos): HxExpr {
    const container = thisContainer(node);
    if (container && ts.isObjectLiteralExpression(container.parent)) {
      const self = this.objectSelves.get(container.parent);
      return self
        ? { ...self, pos }
        : this.unsupported(
            node,
            '`this` in this object method is not supported',
          );
    }
    const context = this.classContexts[this.classContexts.length - 1];
    if (!context) {
      return this.unsupported(node, '`this` outside a class is not supported');
    }
    return context.isStatic
      ? { kind: 'typeRef', path: context.path, type: DYNAMIC, pos }
      : { kind: 'this', type: this.hxTypeOf(node), pos };
  }

  private newExpression(node: ts.NewExpression, pos: SourcePos): HxExpr {
    const args = node.arguments ?? [];
    if (this.libKey(node.expression) === 'Array') {
      return this.newArray(node, args, pos);
    }
    if (this.libKey(node.expression) === 'RegExp') {
      return this.newRegExp(node, args, pos);
    }
    if (this.libKey(node.expression) === 'Promise') {
      return (
        (args.some(ts.isSpreadElement)
          ? undefined
          : newPromise(
              args.map((a) => this.expression(a)),
              this.hxTypeOf(node),
              (hint) => this.freshName(hint),
              pos,
            )) ?? this.unsupported(node)
      );
    }
    if (args.some(ts.isSpreadElement)) {
      return this.unsupported(node);
    }
    const path = this.classOf(node.expression);
    if (!path) {
      return this.newOfClassValue(node, pos);
    }
    const captured = this.captureArguments(
      node,
      this.classSymbolOf(node.expression),
      pos,
    );
    if (typeof captured === 'string') {
      return this.unsupported(node, captured);
    }
    return this.newInstance(node, path, captured, pos);
  }

  private newInstance(
    node: ts.NewExpression,
    path: HxTypePath,
    captured: HxExpr[],
    pos: SourcePos,
  ): HxExpr {
    return {
      kind: 'new',
      path,
      typeArgs: [],
      args: [...captured, ...this.constructorArguments(node)],
      type: this.hxTypeOf(node),
      pos,
    };
  }

  private constructorArguments(node: ts.NewExpression): HxExpr[] {
    return this.arguments(
      node,
      (node.arguments ?? []).map((a) => this.expression(a)),
      false,
    );
  }

  /**
   * `new C()` where `C` is a class value rather than a class name: a class
   * expression is constructed directly, any other value through
   * `Type.createInstance`, cast to the project class the checker resolves.
   */
  private newOfClassValue(node: ts.NewExpression, pos: SourcePos): HxExpr {
    const signature = this.checker.getResolvedSignature(node);
    const symbol = signature?.getReturnType().getSymbol();
    const path = symbol && this.types.classPath(symbol);
    const declaration = symbol?.declarations?.find(ts.isClassLike);
    if (!path || !declaration) {
      return this.unsupported(node);
    }
    const value = this.expression(node.expression);
    const ref = value.kind === 'blockExpr' ? value.result : value;
    if (ref.kind === 'typeRef' && sameTypePath(ref.path, path)) {
      const captured = this.captureArguments(node, symbol, pos);
      if (typeof captured === 'string') {
        return this.unsupported(node, captured);
      }
      const constructed = this.newInstance(node, path, captured, pos);
      return value.kind === 'blockExpr'
        ? { ...value, result: constructed, type: constructed.type }
        : constructed;
    }
    if (
      isHoistedClass(declaration) &&
      this.captures(declaration)?.length !== 0
    ) {
      return this.unsupported(
        node,
        '`new` on a class value whose class captures locals is not supported',
      );
    }
    const parameters = signature
      ? (this.types.signatureType(signature) as Extract<HxType, { kind: 'fn' }>)
          .args
      : [];
    if (parameters.some((p) => p.rest)) {
      return this.unsupported(
        node,
        '`new` on a class value with a rest parameter is not supported',
      );
    }
    const args = this.constructorArguments(node);
    while (args.length < parameters.length) {
      args.push(constExpr(null, pos));
    }
    const type = this.hxTypeOf(node);
    const created = staticCall(
      typePath([], 'Type'),
      'createInstance',
      [
        value,
        {
          kind: 'arrayLit',
          elements: args,
          type: arrayType(DYNAMIC),
          pos,
        },
      ],
      DYNAMIC,
      pos,
    );
    return { kind: 'cast', expr: created, checked: false, type, pos };
  }

  /** `new RegExp(pattern, flags?)`, bound like the call `RegExp(…)`. */
  private newRegExp(
    node: ts.NewExpression,
    args: readonly ts.Expression[],
    pos: SourcePos,
  ): HxExpr {
    const bound = args.some(ts.isSpreadElement)
      ? undefined
      : CALL_BINDINGS.get('RegExp')?.({
          args: args.map((a) => this.expression(a)),
          argTypes: args.map((a) => this.typeOf(a)),
          pos,
          toJsString: this.toJsString,
          freshName: (hint) => this.freshName(hint),
          type: this.hxTypeOf(node),
        });
    return bound ?? this.unsupported(node);
  }

  /** `new Array(n)` / `new Array(a, b)`. */
  private newArray(
    node: ts.NewExpression,
    args: readonly ts.Expression[],
    pos: SourcePos,
  ): HxExpr {
    const spreadIndex = args.findIndex(ts.isSpreadElement);
    const type = this.hxTypeOf(node);
    const element = arrayElement(type);
    const isLength = args.length === 1 && this.isNumberLike(args[0]);
    const converted = args.map((a) =>
      ts.isSpreadElement(a)
        ? this.expression(a.expression)
        : isLength
          ? this.expression(a)
          : this.coerce(this.expression(a), element),
    );
    const bound =
      spreadIndex < 0 || spreadIndex === args.length - 1
        ? arrayConstructor(
            {
              args: converted,
              argTypes: args.map((a) => this.typeOf(a)),
              pos,
              toJsString: this.toJsString,
              spreadLast: spreadIndex >= 0,
              freshName: (hint) => this.freshName(hint),
              type,
            },
            type,
          )
        : undefined;
    return bound ?? this.unsupported(node);
  }

  // ------------------------------------------------------------ functions

  private function(node: FunctionNode): HxFunction {
    const signature = this.checker.getSignatureFromDeclaration(node);
    const typeParams = this.types.typeParams(node);
    const prologue: HxStmt[] = [];
    const params: HxParam[] = node.parameters.map((parameter) => {
      if (!ts.isIdentifier(parameter.name)) {
        return this.patternParameter(parameter, parameter.name, prologue);
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
        prologue.push(this.parameterDefault(name, type, parameter.initializer));
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

  /** `if (p == null) p = <default>;` */
  private parameterDefault(
    name: string,
    type: HxType,
    initializer: ts.Expression,
  ): HxStmt {
    return {
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
            value: this.coerce(this.expression(initializer), type),
            type,
          },
        },
      ],
    };
  }

  /** A destructured parameter: a fresh parameter whose parts the prologue binds. */
  private patternParameter(
    parameter: ts.ParameterDeclaration,
    pattern: ts.BindingPattern,
    prologue: HxStmt[],
  ): HxParam {
    const name = this.freshName('param');
    const declared = this.types.map(this.typeOf(parameter));
    if (parameter.dotDotDotToken) {
      prologue.push(...this.unsupportedStmt(parameter));
      return { name, type: DYNAMIC, optional: true };
    }
    const optional =
      parameter.questionToken !== undefined ||
      parameter.initializer !== undefined;
    const type = optional ? nullable(declared) : declared;
    if (parameter.initializer) {
      prologue.push(this.parameterDefault(name, type, parameter.initializer));
    }
    prologue.push(
      ...this.bindPattern(pattern, localExpr(name, declared), false),
    );
    return { name, type, optional };
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

  /**
   * An operand of string `+` or a template: like `toJsString`, and a `String` that
   * may hold `undefined` despite its type prints `undefined` on every target.
   */
  private concatOperand(expr: HxExpr, type: ts.Type): HxExpr {
    const converted = this.toJsString(expr, type);
    return converted === expr && mayHoldUndefined(expr)
      ? staticCall(RUNTIME.ts2hx, 'stringOperand', [expr], STRING, expr.pos)
      : converted;
  }

  private concatOperandOf(node: ts.Expression): HxExpr {
    return this.concatOperand(this.expression(node), this.typeOf(node));
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
    const chained = this.chainValues.get(node);
    if (chained) {
      return chained;
    }
    if (ts.isOptionalChain(node) && !this.chainMembers.has(node)) {
      return this.optionalChain(node, pos);
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
    if (ts.isRegularExpressionLiteral(node)) {
      return regExpLiteral(node.text, pos);
    }
    if (ts.isTaggedTemplateExpression(node)) {
      return this.taggedTemplate(node, pos);
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
    if (ts.isClassExpression(node)) {
      const declared = this.hoistedDecls.length;
      const stmts = this.hoistClass(node);
      const symbol = this.classSymbol(node);
      const path =
        this.hoistedDecls.length > declared &&
        symbol &&
        this.types.classPath(symbol);
      const ref: HxExpr = path
        ? { kind: 'typeRef', path, type: DYNAMIC, pos }
        : constExpr(null, pos);
      return this.withStmts(stmts, ref);
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
      parts.push(this.concatOperandOf(span.expression));
      parts.push(constExpr(span.literal.text, pos));
    }
    return this.concat(parts, pos);
  }

  /** Only `` String.raw`…` `` so far: the raw text with the values converted by `String()`. */
  private taggedTemplate(
    node: ts.TaggedTemplateExpression,
    pos: SourcePos,
  ): HxExpr {
    const tag = ts.isPropertyAccessExpression(node.tag)
      ? node.tag.name
      : node.tag;
    if (this.libKey(tag) !== 'StringConstructor.raw') {
      return this.unsupported(node);
    }
    const template = node.template;
    if (ts.isNoSubstitutionTemplateLiteral(template)) {
      return constExpr(template.rawText ?? template.text, pos);
    }
    const parts: HxExpr[] = [
      constExpr(template.head.rawText ?? template.head.text, pos),
    ];
    for (const span of template.templateSpans) {
      parts.push(this.concatOperandOf(span.expression));
      parts.push(constExpr(span.literal.rawText ?? span.literal.text, pos));
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
      return (
        VALUE_BINDINGS.get(key)?.(pos) ?? this.unsupported(node, undefined, key)
      );
    }
    const npm = this.npmReference(node);
    if (npm) {
      return this.npmValue(node, npm, pos);
    }
    const classPath = this.classOf(node);
    if (classPath) {
      return { kind: 'typeRef', path: classPath, type: DYNAMIC, pos };
    }
    const value = symbol && this.model.resolveValue(symbol);
    if (value) {
      return this.moduleValue(node, value, pos);
    }
    const captured = symbol && this.capturedLocal(node, symbol, pos);
    if (captured) {
      return captured;
    }
    const declaration = this.localDeclaration(symbol);
    if (!symbol || !declaration) {
      return this.unsupported(
        node,
        `${node.text}: imported bindings are not supported yet`,
      );
    }
    if (
      ts.isEnumDeclaration(declaration) ||
      ts.isModuleDeclaration(declaration)
    ) {
      return this.unsupported(
        node,
        'an enum or namespace object used as a value is not supported',
      );
    }
    if (
      !ts.isVariableDeclaration(declaration) &&
      !ts.isBindingElement(declaration) &&
      !ts.isParameter(declaration) &&
      !ts.isFunctionDeclaration(declaration)
    ) {
      return this.unsupported(node);
    }
    return localExpr(
      this.localName(symbol.name),
      ts.isVariableDeclaration(declaration) || ts.isBindingElement(declaration)
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
    if (value.kind === 'static') {
      return this.staticValue(node, value, pos);
    }
    const { declaration, module, name } = value;
    const type =
      ts.isVariableDeclaration(declaration) || ts.isBindingElement(declaration)
        ? this.declaredType(declaration)
        : ts.isExportAssignment(declaration)
          ? this.hxTypeOf(declaration.expression)
          : this.hxTypeOf(declaration);
    return module === this.info
      ? localExpr(name, type, pos)
      : { kind: 'moduleField', module: module.path, name, type, pos };
  }

  /** A member of an enum (cast to its value type) or a namespace static. */
  private staticValue(
    node: ts.Expression,
    value: Extract<ModuleValue, { kind: 'static' }>,
    pos: SourcePos,
  ): HxExpr {
    const { declaration, module, owner, name } = value;
    const path = {
      pack: module.path.pack,
      module: module.path.module,
      name: owner,
    };
    if (ts.isEnumMember(declaration)) {
      const constant = this.checker.getConstantValue(declaration);
      if (constant === undefined) {
        return this.unsupported(
          node,
          'computed enum members are not supported',
        );
      }
      const type = typeof constant === 'string' ? STRING : FLOAT;
      return {
        kind: 'cast',
        expr: { kind: 'staticField', owner: path, name, type, pos },
        checked: false,
        type,
        pos,
      };
    }
    const type =
      ts.isVariableDeclaration(declaration) || ts.isBindingElement(declaration)
        ? this.declaredType(declaration)
        : this.hxTypeOf(declaration);
    return { kind: 'staticField', owner: path, name, type, pos };
  }

  /** The enum an expression names, with the Haxe path of its `enum abstract`. */
  private enumObject(
    node: ts.Expression,
  ): { symbol: ts.Symbol; path: HxTypePath } | undefined {
    const target = ts.isPropertyAccessExpression(node) ? node.name : node;
    if (!ts.isIdentifier(target)) return undefined;
    let symbol = this.checker.getSymbolAtLocation(target);
    if (symbol && symbol.flags & ts.SymbolFlags.Alias) {
      symbol = this.checker.getAliasedSymbol(symbol);
    }
    if (!symbol || !(symbol.flags & ts.SymbolFlags.Enum)) return undefined;
    const declaration = symbol.declarations?.find(ts.isEnumDeclaration);
    const module =
      declaration && this.model.moduleOf(declaration.getSourceFile());
    const name = declaration && module?.types.get(declaration);
    return module && name !== undefined
      ? {
          symbol,
          path: { pack: module.path.pack, module: module.path.module, name },
        }
      : undefined;
  }

  /** `E[x]`: a member by literal name, or the reverse mapping of a numeric value. */
  private enumElement(
    node: ts.ElementAccessExpression,
    pos: SourcePos,
  ): HxExpr | undefined {
    const object = this.enumObject(node.expression);
    if (!object) return undefined;
    const argument = node.argumentExpression;
    if (
      ts.isStringLiteral(argument) ||
      ts.isNoSubstitutionTemplateLiteral(argument)
    ) {
      const member = this.checker
        .getExportsOfModule(object.symbol)
        .find((m) => m.name === argument.text);
      const value = member && this.model.resolveValue(member);
      return value?.kind === 'static'
        ? this.staticValue(node, value, pos)
        : this.unsupported(node);
    }
    if (!this.isNumberLike(argument)) {
      return this.unsupported(
        node,
        'reading an enum member by a computed name is not supported',
      );
    }
    const members = enumMembers(object.symbol, this.checker);
    const statics = this.model.moduleOf(
      members[0]?.member.getSourceFile() ?? this.sourceFile,
    )?.statics;
    const name = reverseMappingName(
      members.flatMap((m) => statics?.get(m.member)?.name ?? []),
    );
    return staticCall(
      object.path,
      name,
      [this.coerce(this.expression(argument), FLOAT)],
      STRING,
      pos,
    );
  }

  /** `Object.keys`/`values`/`entries` of an enum object: its properties, known statically. */
  private enumObjectCall(
    node: ts.CallExpression,
    pos: SourcePos,
  ): HxExpr | undefined {
    const callee = node.expression;
    const [argument] = node.arguments;
    if (
      !ts.isPropertyAccessExpression(callee) ||
      node.arguments.length !== 1 ||
      ts.isSpreadElement(argument)
    ) {
      return undefined;
    }
    const key = this.libKey(callee.name);
    const kind =
      key === 'ObjectConstructor.keys'
        ? 'keys'
        : key === 'ObjectConstructor.values'
          ? 'values'
          : key === 'ObjectConstructor.entries'
            ? 'entries'
            : undefined;
    const object = kind && this.enumObject(argument);
    if (!kind || !object) return undefined;
    const members = enumMembers(object.symbol, this.checker);
    if (members.some((m) => m.value === undefined)) {
      return this.unsupported(node, 'computed enum members are not supported');
    }
    const entries = enumObjectEntries(members);
    const element = (value: string | number, type: HxType): HxExpr => {
      const constant = constExpr(value, pos);
      return type.kind === 'dynamic'
        ? { kind: 'cast', expr: constant, checked: false, type, pos }
        : constant;
    };
    const arrayOf = (elements: HxExpr[], type: HxType): HxExpr => ({
      kind: 'arrayLit',
      elements,
      type: arrayType(type),
      pos,
    });
    if (kind === 'keys') {
      return arrayOf(
        entries.map(([k]) => constExpr(k, pos)),
        STRING,
      );
    }
    const kinds = new Set(entries.map(([, v]) => typeof v));
    const values =
      kinds.size !== 1 ? DYNAMIC : kinds.has('string') ? STRING : FLOAT;
    if (kind === 'values') {
      return arrayOf(
        entries.map(([, v]) => element(v, values)),
        values,
      );
    }
    return arrayOf(
      entries.map(([k, v]) =>
        arrayOf([element(k, DYNAMIC), element(v, DYNAMIC)], DYNAMIC),
      ),
      arrayType(DYNAMIC),
    );
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
    const npm = this.npmReference(node);
    if (npm) {
      return this.npmValue(node, npm, pos);
    }
    const memberSymbol = this.checker.getSymbolAtLocation(node.name);
    if (memberSymbol && memberSymbol.flags & ts.SymbolFlags.Prototype) {
      return this.unsupported(
        node,
        'class prototypes are out of scope (ADR 0005)',
      );
    }
    const staticMember = memberSymbol && this.model.resolveValue(memberSymbol);
    if (staticMember?.kind === 'static') {
      return this.staticValue(node, staticMember, pos);
    }
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
      return (
        VALUE_BINDINGS.get(key)?.(pos) ?? this.unsupported(node, undefined, key)
      );
    }
    if (node.questionDotToken && !this.chainValues.has(node.expression)) {
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
    if (this.isAccessorBacked(node)) {
      return staticCall(
        REFLECT,
        'getProperty',
        [target, constExpr(name, pos)],
        this.fieldType(target, node),
        pos,
      );
    }
    return {
      kind: 'field',
      target,
      name,
      type: this.fieldType(target, node),
      pos,
    };
  }

  /** Whether a structure member read may hit a class accessor, which Haxe only runs through `Reflect.getProperty`. */
  private isAccessorBacked(node: ts.PropertyAccessExpression): boolean {
    const backed = structuralAccessorMembers(this.model.program);
    if (backed.size === 0) {
      return false;
    }
    const receiver = this.checker.getNonNullableType(
      this.checker.getTypeAtLocation(node.expression),
    );
    const parts = receiver.isUnion() ? receiver.types : [receiver];
    return parts.some((part) => {
      const property = this.checker.getPropertyOfType(part, node.name.text);
      return !!property && backed.has(property);
    });
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
    if (node.questionDotToken && !this.chainValues.has(node.expression)) {
      return this.unsupported(node);
    }
    const enumElement = !assigned && this.enumElement(node, pos);
    if (enumElement) {
      return enumElement;
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
    if (
      isStringType(target.type) &&
      this.isNumberLike(node.argumentExpression) &&
      !assigned
    ) {
      return stringIndex(target, this.expression(node.argumentExpression));
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
    if (!assigned && this.isComputedMember(node, target.type)) {
      return this.getProperty(
        target,
        this.propertyKey(argument),
        this.hxTypeOf(node),
        pos,
      );
    }
    return this.unsupported(node);
  }

  /**
   * `o[k]` with a computed key on an object that is not an array, string or
   * dictionary (e.g. `K extends keyof T`): a reflective property access.
   */
  private isComputedMember(
    node: ts.ElementAccessExpression,
    targetType: HxType,
  ): boolean {
    const keyType = this.typeOf(node.argumentExpression);
    return (
      !isArray(targetType) &&
      !isStringType(targetType) &&
      !dictValue(targetType) &&
      !this.isStringLike(node.expression) &&
      !(keyType.flags & ts.TypeFlags.ESSymbolLike) &&
      !this.isNumberLike(node.argumentExpression) &&
      !ts.isStringLiteral(node.argumentExpression) &&
      !ts.isNoSubstitutionTemplateLiteral(node.argumentExpression)
    );
  }

  private getProperty(
    target: HxExpr,
    key: HxExpr,
    type: HxType,
    pos: SourcePos,
  ): HxExpr {
    const read = staticCall(
      REFLECT,
      'getProperty',
      [target, key],
      DYNAMIC,
      pos,
    );
    return type.kind === 'dynamic'
      ? read
      : { kind: 'cast', expr: read, checked: false, type, pos };
  }

  /** `o[k] = v` / `o[k] op= v` with a computed key: `Ts2hx.setProperty(o, k, v)`. */
  private computedMemberAssign(
    node: ts.BinaryExpression,
    pos: SourcePos,
    operator?: ts.BinaryOperator,
  ): HxExpr | undefined {
    let left = node.left;
    while (ts.isParenthesizedExpression(left) || ts.isNonNullExpression(left)) {
      left = left.expression;
    }
    if (
      !ts.isElementAccessExpression(left) ||
      left.questionDotToken ||
      this.isDict(left.expression) ||
      this.enumObject(left.expression) ||
      !this.isComputedMember(left, this.hxTypeOf(left.expression))
    ) {
      return undefined;
    }
    const type = this.hxTypeOf(left);
    const set = (target: HxExpr, key: HxExpr, value: HxExpr): HxExpr =>
      staticCall(
        RUNTIME.ts2hx,
        'setProperty',
        [target, key, value],
        value.type,
        pos,
      );
    const targetExpr = this.expression(left.expression);
    const keyExpr = this.propertyKey(left.argumentExpression);
    if (operator === undefined) {
      return set(
        targetExpr,
        keyExpr,
        this.coerce(this.expression(node.right), type),
      );
    }
    const target = this.once(targetExpr);
    const key = this.once(keyExpr);
    const value = this.operation(
      operator,
      left,
      node.right,
      pos,
      this.getProperty(target.ref, key.ref, type, pos),
    );
    return value
      ? this.withStmts(
          [...target.stmts, ...key.stmts],
          set(target.ref, key.ref, value),
        )
      : this.unsupported(node);
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
      return target.kind === 'local' || target.kind === 'staticField'
        ? target
        : undefined;
    }
    if (
      ts.isPropertyAccessExpression(node) &&
      isWritableLibProperty(this.libKey(node.name))
    ) {
      const target = this.propertyAccess(node, this.pos(node));
      return target.kind === 'field' ||
        target.kind === 'staticField' ||
        target.kind === 'unsupported'
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
    const length = this.arrayLengthTarget(operand);
    if (length) {
      const op = operator === ts.SyntaxKind.PlusPlusToken ? '+' : '-';
      const updated = this.arrayLengthUpdate(
        length,
        (current) => ({
          kind: 'binop',
          op,
          left: current,
          right: constExpr(1, pos),
          type: FLOAT,
          pos,
        }),
        postfix,
        pos,
      );
      return updated ?? this.unsupported(node);
    }
    const target = this.lvalue(operand);
    if (target?.kind === 'unsupported') {
      return target;
    }
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
      case ts.SyntaxKind.QuestionQuestionEqualsToken:
      case ts.SyntaxKind.BarBarEqualsToken:
      case ts.SyntaxKind.AmpersandAmpersandEqualsToken:
        return this.logicalAssign(node, kind, pos);
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
          this.concatOperand(left, this.typeOf(leftNode)),
          this.concatOperandOf(rightNode),
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
    const left = unwrapParens(node.left);
    if (
      ts.isArrayLiteralExpression(left) ||
      ts.isObjectLiteralExpression(left)
    ) {
      return this.destructuringAssign(
        left,
        this.expression(node.right),
        this.typeOf(node.right),
        pos,
      );
    }
    const dict = this.dictAssign(node, pos);
    if (dict) {
      return dict;
    }
    const computed = this.computedMemberAssign(node, pos);
    if (computed) {
      return computed;
    }
    const length = this.arrayLengthAssign(node);
    if (length) {
      return length;
    }
    const target = this.lvalue(node.left);
    if (!target || target.kind === 'unsupported') {
      return target ?? this.unsupported(node);
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

  /** `xs.length = n` on an array: `JsArray.setLength`. */
  private arrayLengthAssign(node: ts.BinaryExpression): HxExpr | undefined {
    const target = this.arrayLengthTarget(node.left);
    return target
      ? setArrayLength(
          this.expression(target.expression),
          this.expression(node.right),
        )
      : undefined;
  }

  /** The `xs.length` of an array, when `node` is one. */
  private arrayLengthTarget(
    node: ts.Expression,
  ): ts.PropertyAccessExpression | undefined {
    while (ts.isParenthesizedExpression(node) || ts.isNonNullExpression(node)) {
      node = node.expression;
    }
    return ts.isPropertyAccessExpression(node) &&
      this.libKey(node.name) === 'Array.length'
      ? node
      : undefined;
  }

  /**
   * `xs.length op= v`, `++xs.length`, `xs.length--`: reads the length of a
   * once-evaluated array and writes `update(length)` with `JsArray.setLength`.
   * A postfix update evaluates to the old length.
   */
  private arrayLengthUpdate(
    target: ts.PropertyAccessExpression,
    update: (length: HxExpr) => HxExpr | undefined,
    postfix: boolean,
    pos: SourcePos,
  ): HxExpr | undefined {
    const array = this.once(this.expression(target.expression));
    const length: HxExpr = {
      kind: 'field',
      target: array.ref,
      name: 'length',
      type: INT,
      pos,
    };
    if (!postfix) {
      const updated = update(length);
      return (
        updated &&
        this.withStmts(array.stmts, setArrayLength(array.ref, updated))
      );
    }
    const name = this.freshName('length');
    const old = localExpr(name, FLOAT, pos);
    const updated = update(old);
    return (
      updated &&
      this.withStmts(
        [
          ...array.stmts,
          { kind: 'var', name, final: true, type: FLOAT, init: length },
          { kind: 'expr', expr: setArrayLength(array.ref, updated) },
        ],
        old,
      )
    );
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
    const computed = this.computedMemberAssign(node, pos, operator);
    if (computed) {
      return computed;
    }
    const length = this.arrayLengthTarget(node.left);
    if (length) {
      const updated = this.arrayLengthUpdate(
        length,
        (current) =>
          this.operation(operator, node.left, node.right, pos, current),
        false,
        pos,
      );
      return updated ?? this.unsupported(node);
    }
    const target = this.lvalue(node.left);
    if (!target || target.kind === 'unsupported') {
      return target ?? this.unsupported(node);
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
        this.concatOperandOf(node.right),
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

  /** `a ??= b`, `a ||= b`, `a &&= b`: the target is read once and written only when the operator says so. */
  private logicalAssign(
    node: ts.BinaryExpression,
    kind: ts.SyntaxKind,
    pos: SourcePos,
  ): HxExpr {
    const access = this.logicalTarget(node.left, pos);
    if (!access) {
      return this.unsupported(node);
    }
    const { read, write, stmts } = access;
    const written = write(this.expression(node.right));
    const type = read.type;
    let cond: HxExpr;
    if (kind === ts.SyntaxKind.QuestionQuestionEqualsToken) {
      if (!isNullable(type) && type.kind !== 'dynamic') {
        return this.withStmts(stmts, read);
      }
      cond = {
        kind: 'binop',
        op: '!=',
        left: read,
        right: constExpr(null),
        type: BOOL,
        pos,
      };
    } else {
      cond = this.truthy(read, this.typeOf(node.left));
    }
    const keepsWhenTruthy =
      kind !== ts.SyntaxKind.AmpersandAmpersandEqualsToken;
    const kept = this.branch(read, type);
    const assigned = this.branch(written, type);
    return this.withStmts(stmts, {
      kind: 'ternary',
      cond,
      then: keepsWhenTruthy ? kept : assigned,
      else: keepsWhenTruthy ? assigned : kept,
      type,
      pos,
    });
  }

  /** The target of a logical assignment, its object and key evaluated once. */
  private logicalTarget(
    node: ts.Expression,
    pos: SourcePos,
  ):
    | { read: HxExpr; write: (value: HxExpr) => HxExpr; stmts: HxStmt[] }
    | undefined {
    const left = unwrapParens(node);
    const access =
      ts.isPropertyAccessExpression(left) || ts.isElementAccessExpression(left)
        ? left
        : undefined;
    if (
      access &&
      !(
        ts.isPropertyAccessExpression(access) &&
        this.libKey(access.name) !== undefined
      ) &&
      this.isDict(access.expression)
    ) {
      const dict = this.once(this.expression(access.expression));
      const key = this.once(
        ts.isPropertyAccessExpression(access)
          ? constExpr(access.name.text, pos)
          : this.propertyKey(access.argumentExpression),
      );
      return {
        read: this.dictGet(dict.ref, key.ref, pos),
        write: (value) => this.dictSet(dict.ref, key.ref, value, pos),
        stmts: [...dict.stmts, ...key.stmts],
      };
    }
    const target = this.lvalue(node);
    if (!target || target.kind === 'unsupported') {
      return undefined;
    }
    const assign =
      (to: HxExpr) =>
      (value: HxExpr): HxExpr => ({
        kind: 'assign',
        op: '=',
        target: to,
        value: this.coerce(value, to.type),
        type: to.type,
        pos,
      });
    if (target.kind === 'field') {
      const object = this.once(target.target);
      const ref: HxExpr = { ...target, target: object.ref };
      return { read: ref, write: assign(ref), stmts: object.stmts };
    }
    if (target.kind === 'index') {
      const object = this.once(target.target);
      const index = this.once(target.index);
      const ref: HxExpr = { ...target, target: object.ref, index: index.ref };
      return {
        read: ref,
        write: assign(ref),
        stmts: [...object.stmts, ...index.stmts],
      };
    }
    return { read: target, write: assign(target), stmts: [] };
  }

  /**
   * `a?.b.c`, `a?.[i]`, `f?.()`: the value before the nearest `?.` is read once and the
   * rest of the chain runs only when it is not null (a short-circuited chain is `null`).
   */
  private optionalChain(node: ts.OptionalChain, pos: SourcePos): HxExpr {
    const members: ts.Node[] = [node];
    let link: ts.Expression = node;
    while (
      !(link as { questionDotToken?: ts.QuestionDotToken }).questionDotToken
    ) {
      link = (link as ts.OptionalChain).expression;
      if (!ts.isOptionalChain(link)) {
        return this.unsupported(node);
      }
      members.push(link);
    }
    const guarded = (link as ts.OptionalChain).expression;
    const value = this.expression(guarded);
    const checked = isNullable(value.type) || value.type.kind === 'dynamic';
    const { ref, stmts } = checked
      ? this.stored(value, 'chain')
      : { ref: value, stmts: [] as HxStmt[] };
    const nonNull: HxExpr =
      ref.type.kind === 'null' ? { ...ref, type: ref.type.inner } : ref;
    members.forEach((m) => this.chainMembers.add(m));
    this.chainValues.set(guarded, nonNull);
    let inner: HxExpr;
    try {
      inner = this.effect(node);
    } finally {
      members.forEach((m) => this.chainMembers.delete(m));
      this.chainValues.delete(guarded);
    }
    if (!checked) {
      return this.withStmts(stmts, inner);
    }
    const isNull: HxExpr = {
      kind: 'binop',
      op: '==',
      left: ref,
      right: constExpr(null),
      type: BOOL,
      pos,
    };
    if (sameType(inner.type, VOID)) {
      return {
        kind: 'blockExpr',
        stmts: [
          ...stmts,
          {
            kind: 'if',
            cond: this.not(isNull, pos),
            then: [{ kind: 'expr', expr: inner }],
          },
        ],
        result: constExpr(null, pos),
        type: DYNAMIC,
        pos,
      };
    }
    const mapped = this.hxTypeOf(node);
    const type = mapped.kind === 'dynamic' ? mapped : nullable(mapped);
    const result: HxExpr = {
      kind: 'ternary',
      cond: isNull,
      then: constExpr(null, pos),
      else: this.branch(inner, type),
      type,
      pos,
    };
    if (type.kind !== 'null') {
      return this.withStmts(stmts, result);
    }
    const typed = this.stored(result, 'chained');
    return this.withStmts([...stmts, ...typed.stmts], typed.ref);
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
    return type.getCallSignatures().length > 0 ||
      type.getConstructSignatures().length > 0
      ? 'function'
      : 'object';
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
    if (node.elements.some(ts.isOmittedExpression)) {
      return this.unsupported(node);
    }
    const type = this.hxTypeOf(node);
    const element =
      type.kind === 'path' && type.path.name === 'Array'
        ? type.params[0]
        : DYNAMIC;
    if (!node.elements.some(ts.isSpreadElement)) {
      return {
        kind: 'arrayLit',
        elements: node.elements.map((e) =>
          this.branch(retypeArrayLiteral(this.expression(e), element), element),
        ),
        type,
        pos,
      };
    }
    return this.spreadArrayLiteral(node, node.elements, type, element, pos);
  }

  /**
   * `[a, ...xs, ...s]`: runs of plain elements and spread arrays or strings,
   * joined with `concat` into a fresh array, or appended one element at a
   * time when a spread's element type differs from the literal's.
   */
  private spreadArrayLiteral(
    node: ts.Node,
    elements: readonly ts.Expression[],
    type: HxType,
    element: HxType,
    pos: SourcePos,
  ): HxExpr {
    const segments: ArraySegment[] = [];
    let plain: HxExpr[] = [];
    const flush = () => {
      if (plain.length > 0) {
        segments.push({ spread: false, value: plain });
        plain = [];
      }
    };
    for (const e of elements) {
      if (!ts.isSpreadElement(e)) {
        plain.push(this.branch(this.expression(e), element));
        continue;
      }
      flush();
      const spread = this.expression(e.expression);
      if (this.isStringLike(e.expression)) {
        segments.push({
          spread: true,
          value: stringCodePoints(spread),
          fresh: true,
        });
      } else if (this.checker.isArrayLikeType(this.typeOf(e.expression))) {
        if (!isArray(spread.type)) return this.unsupported(node);
        segments.push({ spread: true, value: spread, fresh: false });
      } else if (isRegExpIterator(spread.type)) {
        segments.push({
          spread: true,
          value: regExpIteratorArray(spread),
          fresh: true,
        });
      } else {
        return this.unsupported(
          node,
          'spreading a non-array iterable is not supported yet',
        );
      }
    }
    flush();
    const uniform = segments.every(
      (s) => !s.spread || sameType(arrayElement(s.value.type), element),
    );
    return uniform
      ? this.concatSegments(segments, type, pos)
      : this.appendSegments(segments, type, element, pos);
  }

  private concatSegments(
    segments: ArraySegment[],
    type: HxType,
    pos: SourcePos,
  ): HxExpr {
    const arrays = segments.map<HxExpr>((s) =>
      s.spread ? s.value : { kind: 'arrayLit', elements: s.value, type, pos },
    );
    const [first, ...rest] = arrays;
    const firstIsFresh = !segments[0].spread || segments[0].fresh;
    const method = (target: HxExpr, name: string, args: HxExpr[]): HxExpr => ({
      kind: 'call',
      callee: { kind: 'field', target, name, type: DYNAMIC },
      args,
      type,
      pos,
    });
    const head =
      rest.length === 0 && !firstIsFresh ? method(first, 'copy', []) : first;
    return rest.reduce<HxExpr>(
      (joined, segment) => method(joined, 'concat', [segment]),
      head,
    );
  }

  /** `{ final r = [...]; for (x in xs) r.push(x); r; }`: each element converted to the literal's element type. */
  private appendSegments(
    segments: ArraySegment[],
    type: HxType,
    element: HxType,
    pos: SourcePos,
  ): HxExpr {
    const name = this.freshName('spread');
    const result = localExpr(name, type, pos);
    const push = (value: HxExpr): HxStmt => ({
      kind: 'expr',
      expr: {
        kind: 'call',
        callee: { kind: 'field', target: result, name: 'push', type: DYNAMIC },
        args: [value],
        type: INT,
        pos,
      },
    });
    const [first, ...rest] = segments;
    const initial = first.spread ? [] : first.value;
    const stmts: HxStmt[] = [
      {
        kind: 'var',
        name,
        final: true,
        type,
        init: { kind: 'arrayLit', elements: initial, type, pos },
      },
    ];
    for (const segment of first.spread ? segments : rest) {
      if (!segment.spread) {
        stmts.push(...segment.value.map(push));
        continue;
      }
      const item = this.freshName('item');
      stmts.push({
        kind: 'forIn',
        name: item,
        iterable: segment.value,
        body: [
          push(
            this.branch(
              localExpr(item, arrayElement(segment.value.type), pos),
              element,
            ),
          ),
        ],
      });
    }
    return { kind: 'blockExpr', stmts, result, type, pos };
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
      const value = this.types.map(dictValueType);
      return node.properties.some(ts.isSpreadAssignment)
        ? this.spreadDictLiteral(node, value, pos)
        : this.dictLiteral(node, value, pos);
    }
    if (node.properties.some(ts.isSpreadAssignment)) {
      return this.spreadObjectLiteral(node, pos);
    }
    const type = this.hxTypeOf(node);
    const self = node.properties.some(
      (p) =>
        (ts.isMethodDeclaration(p) || ts.isAccessor(p)) &&
        !!p.body &&
        usesThis(p.body),
    )
      ? localExpr(this.freshName('self'), type, pos)
      : undefined;
    if (self) this.objectSelves.set(node, self);
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
    const literal: HxExpr = { kind: 'objectLit', fields, type, pos };
    if (!self || self.kind !== 'local') {
      return literal;
    }
    return {
      kind: 'blockExpr',
      stmts: [
        {
          kind: 'var',
          name: self.name,
          final: false,
          type,
          init: constExpr(null),
        },
        {
          kind: 'expr',
          expr: { kind: 'assign', op: '=', target: self, value: literal, type },
        },
      ],
      result: self,
      type,
      pos,
    };
  }

  /** The properties a spread of a value of `type` copies: own data properties, not class methods or accessors. */
  private spreadProperties(type: ts.Type): ts.Symbol[] {
    return this.checker
      .getPropertiesOfType(this.checker.getNonNullableType(type))
      .filter(
        (property) =>
          !property.name.startsWith('#') &&
          !(property.declarations ?? []).some(
            (d) =>
              ts.isClassLike(d.parent) &&
              (ts.isMethodDeclaration(d) || ts.isAccessor(d)),
          ),
      );
  }

  /** A spread source, read once; `undefined` for a nullable source, which needs a run-time check. */
  private spreadSource(
    property: ts.SpreadAssignment,
    stmts: HxStmt[],
  ): { ref: HxExpr; type: ts.Type } | undefined {
    const type = this.typeOf(property.expression);
    if (constituents(type).some((t) => t.flags & NULLISH_FLAGS)) {
      return undefined;
    }
    const stored = this.stored(this.expression(property.expression), 'spread');
    stmts.push(...stored.stmts);
    return { ref: stored.ref, type };
  }

  /** A property of an object literal other than a spread: its name and its converted value. */
  private literalProperty(
    property: ts.ObjectLiteralElementLike,
  ): { name: string; value: HxExpr } | undefined {
    const name = property.name && this.patternKey(property.name);
    if (name === undefined) {
      return undefined;
    }
    if (ts.isPropertyAssignment(property)) {
      return { name, value: this.expression(property.initializer) };
    }
    if (
      ts.isShorthandPropertyAssignment(property) &&
      !property.objectAssignmentInitializer
    ) {
      return { name, value: this.expression(property.name) };
    }
    if (ts.isMethodDeclaration(property) && !property.asteriskToken) {
      return { name, value: this.functionExpr(property, this.pos(property)) };
    }
    return undefined;
  }

  /**
   * `{ a, ...o, b }` with the static key order (ADR 0005): a spread copies the data
   * properties of its source's type, and a later key replaces an earlier one in place.
   * Values are evaluated in source order through temporaries. An absent optional
   * property keeps the earlier value (`undefined` and `null` are merged, ADR 0002).
   */
  private spreadObjectLiteral(
    node: ts.ObjectLiteralExpression,
    pos: SourcePos,
  ): HxExpr {
    if (
      node.properties.some(
        (p) => ts.isSpreadAssignment(p) && this.hasUnknownKeys(p.expression),
      )
    ) {
      return this.reflectiveSpreadLiteral(node, pos);
    }
    const stmts: HxStmt[] = [];
    const fields = new Map<string, HxExpr>();
    for (const property of node.properties) {
      if (ts.isSpreadAssignment(property)) {
        const source = this.spreadSource(property, stmts);
        if (!source || dictValue(source.ref.type)) {
          return this.unsupported(node);
        }
        for (const spread of this.spreadProperties(source.type)) {
          const name = escapeIdentifier(spread.name);
          const read = this.readProperty(
            source.ref,
            source.type,
            spread.name,
            pos,
          );
          const earlier = fields.get(name);
          fields.set(
            name,
            earlier && spread.flags & ts.SymbolFlags.Optional
              ? {
                  kind: 'ternary',
                  cond: {
                    kind: 'binop',
                    op: '==',
                    left: read,
                    right: constExpr(null),
                    type: BOOL,
                  },
                  then: this.coerce(earlier, read.type),
                  else: read,
                  type: read.type,
                  pos,
                }
              : read,
          );
        }
        continue;
      }
      const converted = this.literalProperty(property);
      if (!converted) {
        return this.unsupported(node);
      }
      const { ref, stmts: temps } = this.once(converted.value);
      stmts.push(...temps);
      fields.set(escapeIdentifier(converted.name), ref);
    }
    return this.withStmts(stmts, {
      kind: 'objectLit',
      fields: [...fields].map(([name, value]) => ({ name, value })),
      type: this.hxTypeOf(node),
      pos,
    });
  }

  /** Whether the keys of a spread source are unknown statically: a type parameter or `any`. */
  private hasUnknownKeys(node: ts.Expression): boolean {
    return constituents(this.typeOf(node)).some(
      (t) =>
        (t.flags &
          (ts.TypeFlags.TypeParameter |
            ts.TypeFlags.Any |
            ts.TypeFlags.IndexedAccess)) !==
        0,
    );
  }

  /**
   * `{ a, ...t }` where a spread source has keys unknown statically (e.g. a generic
   * value): a fresh object filled in source order by reflection. Its key order is
   * the target's `Reflect.fields` order (ADR 0002, degraded).
   */
  private reflectiveSpreadLiteral(
    node: ts.ObjectLiteralExpression,
    pos: SourcePos,
  ): HxExpr {
    const name = this.freshName('spread');
    const object = localExpr(name, DYNAMIC, pos);
    const stmts: HxStmt[] = [
      {
        kind: 'var',
        name,
        final: true,
        type: DYNAMIC,
        init: { kind: 'objectLit', fields: [], type: DYNAMIC, pos },
      },
    ];
    for (const property of node.properties) {
      if (ts.isSpreadAssignment(property)) {
        if (this.isDict(property.expression)) {
          return this.unsupported(node);
        }
        stmts.push({
          kind: 'expr',
          expr: staticCall(
            RUNTIME.ts2hx,
            'assign',
            [object, this.expression(property.expression)],
            VOID,
            pos,
          ),
        });
        continue;
      }
      const converted = this.literalProperty(property);
      if (!converted) {
        return this.unsupported(node);
      }
      stmts.push({
        kind: 'expr',
        expr: staticCall(
          REFLECT,
          'setField',
          [object, constExpr(converted.name, pos), converted.value],
          VOID,
          pos,
        ),
      });
    }
    return this.withStmts(stmts, this.coerce(object, this.hxTypeOf(node)));
  }

  /** A dictionary literal with spreads: a fresh `Dict` filled in source order. */
  private spreadDictLiteral(
    node: ts.ObjectLiteralExpression,
    value: HxType,
    pos: SourcePos,
  ): HxExpr {
    const type = dictType(value);
    const dictName = this.freshName('dict');
    const dict = localExpr(dictName, type, pos);
    const stmts: HxStmt[] = [
      {
        kind: 'var',
        name: dictName,
        final: true,
        type,
        init: {
          kind: 'new',
          path: RUNTIME.dict,
          typeArgs: [value],
          args: [],
          type,
          pos,
        },
      },
    ];
    const set = (key: HxExpr, entry: HxExpr): HxStmt => ({
      kind: 'expr',
      expr: this.dictSet(dict, key, entry, pos),
    });
    for (const property of node.properties) {
      if (!ts.isSpreadAssignment(property)) {
        const converted = this.literalProperty(property);
        if (!converted) {
          return this.unsupported(node);
        }
        stmts.push(set(constExpr(converted.name, pos), converted.value));
        continue;
      }
      const source = this.spreadSource(property, stmts);
      if (!source) {
        return this.unsupported(node);
      }
      if (dictValue(source.ref.type)) {
        const keyName = this.freshName('key');
        const key = localExpr(keyName, STRING, pos);
        stmts.push({
          kind: 'forIn',
          name: keyName,
          iterable: {
            kind: 'call',
            callee: {
              kind: 'field',
              target: source.ref,
              name: 'keys',
              type: DYNAMIC,
            },
            args: [],
            type: arrayType(STRING),
          },
          body: [set(key, this.dictGet(source.ref, key, pos))],
        });
        continue;
      }
      for (const spread of this.spreadProperties(source.type)) {
        stmts.push(
          set(
            constExpr(spread.name, pos),
            this.readProperty(source.ref, source.type, spread.name, pos),
          ),
        );
      }
    }
    return { kind: 'blockExpr', stmts, result: dict, type, pos };
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
    const enumCall = this.enumObjectCall(node, pos);
    if (enumCall) {
      return enumCall;
    }
    const callee = node.expression;
    const callArgs = this.callArguments(node, pos);
    if ('unsupported' in callArgs) {
      return callArgs.unsupported;
    }
    const { args, argTypes, spreadLast } = callArgs;
    const npm = this.npmReference(callee);
    if (npm) {
      return this.npmCall(node, npm, args, spreadLast, pos);
    }
    const nameNode = ts.isPropertyAccessExpression(callee)
      ? callee.name
      : ts.isIdentifier(callee)
        ? callee
        : undefined;
    const key = nameNode && this.libKey(nameNode);
    if (key !== undefined) {
      const resultType = () => this.hxTypeOf(node);
      const binding = CALL_BINDINGS.get(key);
      const bound = binding?.({
        receiver: ts.isPropertyAccessExpression(callee)
          ? this.receiver(callee.expression)
          : undefined,
        args,
        argTypes,
        pos,
        toJsString: this.toJsString,
        spreadLast,
        freshName: (hint) => this.freshName(hint),
        get type() {
          return resultType();
        },
      });
      return bound ?? this.unsupported(node, undefined, key);
    }
    const unguarded = node.questionDotToken
      ? !this.chainValues.has(callee)
      : ts.isPropertyAccessExpression(callee) &&
        !!callee.questionDotToken &&
        !this.chainValues.has(callee.expression);
    if (unguarded) {
      return this.unsupported(node);
    }
    const signature = this.checker.getResolvedSignature(node);
    const ret = signature
      ? this.types.mapReturn(signature.getReturnType())
      : DYNAMIC;
    const superCaptures =
      callee.kind === ts.SyntaxKind.SuperKeyword
        ? (this.classContexts[this.classContexts.length - 1]?.superCaptures ??
          [])
        : [];
    const call: HxExpr = {
      kind: 'call',
      callee: this.expression(callee),
      args: [...superCaptures, ...this.arguments(node, args, spreadLast)],
      spreadLast,
      type: ret,
      pos,
    };
    return returnsThis(signature)
      ? { kind: 'cast', expr: call, checked: false, type: ret, pos }
      : call;
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
    const converted = args.map((arg, i) => {
      const parameter = parameterTypes[Math.min(i, parameterTypes.length - 1)];
      return parameter && !(spreadLast && i === args.length - 1)
        ? this.coerce(
            this.padToParameter(arg, parameter.type),
            parameter.optional ? nullable(parameter.type) : parameter.type,
          )
        : arg;
    });
    return spreadLast || !signature
      ? converted
      : [...converted, ...this.omittedVoidArguments(signature, args.length)];
  }

  /** `undefined` for trailing `void` parameters a call omits (`resolve()` of a `Promise<void>`). */
  private omittedVoidArguments(
    signature: ts.Signature,
    given: number,
  ): HxExpr[] {
    const omitted = signature.parameters.slice(given);
    const required = omitted.findIndex((parameter) => {
      const declaration = parameter.valueDeclaration;
      return (
        !!declaration &&
        ts.isParameter(declaration) &&
        !declaration.questionToken &&
        !declaration.dotDotDotToken &&
        !declaration.initializer
      );
    });
    if (required < 0) {
      return [];
    }
    return omitted.slice(0, required + 1).map(() => constExpr(null));
  }

  /** A callback passed where a function type with more parameters is expected, padded to its arity. */
  private padToParameter(arg: HxExpr, parameter: HxType): HxExpr {
    const expected = parameter.kind === 'null' ? parameter.inner : parameter;
    if (
      expected.kind !== 'fn' ||
      arg.type.kind !== 'fn' ||
      expected.args.length === 0 ||
      expected.args.some((a) => a.rest || a.optional) ||
      arg.type.args.length >= expected.args.length
    ) {
      return arg;
    }
    const [first, ...extra] = expected.args.map((a) => a.type);
    return (
      padCallback(arg, first, extra, (hint) => this.freshName(hint)) ?? arg
    );
  }

  /**
   * A call's arguments. With spreads, the arguments that land in the rest
   * parameter become one array spread last (`f(a, ...[b].concat(xs))`): Haxe
   * spreads only a lone array into a rest parameter.
   */
  private callArguments(
    node: ts.CallExpression,
    pos: SourcePos,
  ):
    | { args: HxExpr[]; argTypes: ts.Type[]; spreadLast: boolean }
    | { unsupported: HxExpr } {
    const spreadIndex = node.arguments.findIndex(ts.isSpreadElement);
    if (spreadIndex < 0) {
      return {
        args: node.arguments.map((a) => this.expression(a)),
        argTypes: node.arguments.map((a) => this.typeOf(a)),
        spreadLast: false,
      };
    }
    const rest = this.restParameter(node);
    if (!rest || spreadIndex < rest.index) {
      return {
        unsupported: this.unsupported(
          node,
          'spread into a non-rest parameter is not supported yet',
        ),
      };
    }
    const fixed = node.arguments.slice(0, rest.index);
    const restArgs = node.arguments.slice(rest.index);
    const args = fixed.map((a) => this.expression(a));
    const restArray = this.restArray(node, restArgs, rest.type, pos);
    return {
      args: [...args, restArray],
      argTypes: [...fixed.map((a) => this.typeOf(a)), rest.type],
      spreadLast: true,
    };
  }

  /** The resolved signature's rest parameter: its position and array type. */
  private restParameter(
    node: ts.CallExpression,
  ): { index: number; type: ts.Type } | undefined {
    const parameters = this.checker.getResolvedSignature(node)?.parameters;
    const index = (parameters?.length ?? 0) - 1;
    const parameter = parameters?.[index];
    const declaration = parameter?.valueDeclaration;
    return declaration &&
      ts.isParameter(declaration) &&
      declaration.dotDotDotToken
      ? { index, type: this.checker.getTypeOfSymbol(parameter) }
      : undefined;
  }

  /** The arguments passed to a rest parameter as one array: a lone spread array of the rest's element type as is. */
  private restArray(
    node: ts.CallExpression,
    restArgs: readonly ts.Expression[],
    restType: ts.Type,
    pos: SourcePos,
  ): HxExpr {
    const type = this.types.map(restType);
    const element = arrayElement(type);
    const [only] = restArgs;
    if (
      restArgs.length === 1 &&
      ts.isSpreadElement(only) &&
      this.checker.isArrayLikeType(this.typeOf(only.expression))
    ) {
      const spread = this.expression(only.expression);
      if (
        sameType(arrayElement(spread.type), element) ||
        !isArray(spread.type)
      ) {
        return spread;
      }
      return this.appendSegments(
        [{ spread: true, value: spread, fresh: false }],
        type,
        element,
        pos,
      );
    }
    return this.spreadArrayLiteral(node, restArgs, type, element, pos);
  }

  /** The npm package or member an identifier or `namespace.member` access names. */
  private npmReference(node: ts.Expression): NpmReference | undefined {
    if (ts.isIdentifier(node)) {
      const imported = npmImportOf(
        this.checker,
        this.checker.getSymbolAtLocation(node),
      );
      if (!imported) {
        return undefined;
      }
      const { pkg, name } = imported;
      if (name === '*') {
        return { pkg };
      }
      if (name === 'default') {
        const member = NPM_SHIMS.get(pkg)?.defaultMember;
        return member ? { pkg, member } : { pkg };
      }
      return { pkg, member: name, memberNode: node };
    }
    if (
      ts.isPropertyAccessExpression(node) &&
      ts.isIdentifier(node.expression)
    ) {
      const target = this.npmReference(node.expression);
      return target && target.member === undefined
        ? { pkg: target.pkg, member: node.name.text, memberNode: node.name }
        : undefined;
    }
    return undefined;
  }

  private npmValue(
    node: ts.Expression,
    npm: NpmReference,
    pos: SourcePos,
  ): HxExpr {
    const owner = this.npmOwner(node, npm);
    if (!owner) {
      return this.npmUnsupported(node, npm);
    }
    return {
      kind: 'staticField',
      owner,
      name: escapeIdentifier(npm.member!),
      type: this.hxTypeOf(node),
      pos,
    };
  }

  private npmCall(
    node: ts.CallExpression,
    npm: NpmReference,
    args: HxExpr[],
    spreadLast: boolean,
    pos: SourcePos,
  ): HxExpr {
    const owner = this.npmOwner(node.expression, npm);
    if (!owner) {
      return this.npmUnsupported(node, npm);
    }
    if (spreadLast) {
      return this.unsupported(
        node,
        'spread arguments to an npm package are not supported yet',
      );
    }
    const arity = NPM_SHIMS.get(npm.pkg)?.members.get(npm.member!);
    const converted =
      arity === undefined
        ? this.arguments(node, args, false)
        : args.map((arg) =>
            arity > 0
              ? (padCallback(
                  arg,
                  DYNAMIC,
                  Array.from({ length: arity - 1 }, () => DYNAMIC),
                  (hint) => this.freshName(hint),
                ) ?? arg)
              : arg,
          );
    return staticCall(
      owner,
      escapeIdentifier(npm.member!),
      converted,
      this.hxTypeOf(node),
      pos,
    );
  }

  /** The shim or extern class an npm member lives on, or `undefined` when it has none. */
  private npmOwner(
    node: ts.Expression,
    npm: NpmReference,
  ): HxTypePath | undefined {
    if (npm.member === undefined) {
      return undefined;
    }
    const shim = NPM_SHIMS.get(npm.pkg);
    if (shim) {
      return shim.members.has(npm.member) ? shim.owner : undefined;
    }
    this.externs.add(
      npm.pkg,
      npm.member,
      this.externDeclaration(npm.member, npm.memberNode ?? node),
    );
    return ExternRegistry.path(this.model.rootPackage, npm.pkg);
  }

  private npmUnsupported(node: ts.Node, npm: NpmReference): HxExpr {
    if (npm.member === undefined) {
      return this.unsupported(
        node,
        `npm package "${npm.pkg}" used as a value is not supported yet`,
      );
    }
    const member = `${npm.pkg}.${npm.member}`;
    return this.unsupported(
      node,
      `${member} has no ts2hx shim (ADR 0005)`,
      member,
    );
  }

  /** The extern field of an npm member: a typed function for a single signature, else `Dynamic`. */
  private externDeclaration(member: string, node: ts.Node): string {
    const name = escapeIdentifier(member);
    const native =
      name === member ? '' : `@:native(${JSON.stringify(member)}) `;
    let symbol = this.checker.getSymbolAtLocation(node);
    if (symbol && symbol.flags & ts.SymbolFlags.Alias) {
      symbol = this.checker.getAliasedSymbol(symbol);
    }
    const declarations = symbol?.declarations ?? [];
    const declaration = declarations[0];
    if (declarations.length !== 1 || !ts.isFunctionDeclaration(declaration)) {
      return `${native}static var ${name}:Dynamic;`;
    }
    const signature = this.checker.getSignatureFromDeclaration(declaration)!;
    const params = declaration.parameters.map((parameter, i) => {
      const paramName = ts.isIdentifier(parameter.name)
        ? escapeIdentifier(parameter.name.text)
        : `arg${i}`;
      if (parameter.dotDotDotToken) {
        return `${paramName}:haxe.extern.Rest<Dynamic>`;
      }
      const optional = parameter.questionToken || parameter.initializer;
      const type = this.externType(
        optional
          ? this.checker.getNonNullableType(this.typeOf(parameter))
          : this.typeOf(parameter),
      );
      return `${optional ? '?' : ''}${paramName}:${type}`;
    });
    const ret = this.externType(signature.getReturnType());
    return `${native}static function ${name}(${params.join(', ')}):${ret};`;
  }

  private externType(type: ts.Type): string {
    const printed = printType(this.types.map(type));
    return EXTERN_PRIMITIVES.has(printed) ? printed : 'Dynamic';
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
