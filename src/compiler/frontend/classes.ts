import ts from 'typescript';

import { libErrorClassPath } from '../stdlib/errors';

/** A class member that declares an instance field: a property or a parameter property. */
export type FieldDeclaration = ts.PropertyDeclaration | ts.ParameterDeclaration;

export function hasModifier(node: ts.Node, flag: ts.ModifierFlags): boolean {
  return (ts.getCombinedModifierFlags(node as ts.Declaration) & flag) !== 0;
}

export function isStatic(member: ts.Node): boolean {
  return hasModifier(member, ts.ModifierFlags.Static);
}

export function isParameterProperty(
  node: ts.Node,
): node is ts.ParameterDeclaration {
  return (
    ts.isParameter(node) &&
    ts.isConstructorDeclaration(node.parent) &&
    hasModifier(node, ts.ModifierFlags.ParameterPropertyModifier)
  );
}

export function isFieldDeclaration(node: ts.Node): node is FieldDeclaration {
  return (
    (ts.isPropertyDeclaration(node) && !isStatic(node)) ||
    isParameterProperty(node)
  );
}

/** The class a field or method belongs to. */
export function owningClass(member: ts.Node): ts.ClassLikeDeclaration {
  return (
    isParameterProperty(member) ? member.parent.parent : member.parent
  ) as ts.ClassLikeDeclaration;
}

/** The `extends` clause of a class. */
export function extendsClause(
  node: ts.ClassLikeDeclaration,
): ts.ExpressionWithTypeArguments | undefined {
  return node.heritageClauses?.find(
    (c) => c.token === ts.SyntaxKind.ExtendsKeyword,
  )?.types[0];
}

/** The class a class `extends`, when it is a class declaration of the program. */
export function baseClass(
  checker: ts.TypeChecker,
  node: ts.ClassLikeDeclaration,
): ts.ClassDeclaration | undefined {
  const heritage = extendsClause(node);
  if (!heritage) {
    return undefined;
  }
  const symbol = checker.getSymbolAtLocation(heritage.expression);
  const target =
    symbol && symbol.flags & ts.SymbolFlags.Alias
      ? checker.getAliasedSymbol(symbol)
      : symbol;
  return target?.declarations?.find(ts.isClassDeclaration);
}

/** Whether `node` or one of its ancestors extends a lib error class (`ts2hx.Error`). */
export function extendsLibError(
  checker: ts.TypeChecker,
  node: ts.ClassLikeDeclaration,
): boolean {
  const root = [node, ...ancestors(checker, node)].pop()!;
  const heritage = extendsClause(root);
  const symbol = heritage && checker.getSymbolAtLocation(heritage.expression);
  return !!symbol && libErrorClassPath(symbol) !== undefined;
}

/** The classes `node` extends, nearest first. */
export function ancestors(
  checker: ts.TypeChecker,
  node: ts.ClassLikeDeclaration,
): ts.ClassDeclaration[] {
  const result: ts.ClassDeclaration[] = [];
  for (
    let base = baseClass(checker, node);
    base && !result.includes(base);
    base = baseClass(checker, base)
  ) {
    result.push(base);
  }
  return result;
}

function memberName(member: ts.Node): string | undefined {
  const name = (member as ts.NamedDeclaration).name;
  return name &&
    (ts.isIdentifier(name) ||
      ts.isStringLiteral(name) ||
      ts.isNumericLiteral(name))
    ? name.text
    : undefined;
}

/** The instance members of a class with this name: properties, parameter properties, methods, accessors. */
function instanceMembers(
  node: ts.ClassLikeDeclaration,
  name: string,
): ts.Node[] {
  const members: ts.Node[] = node.members.filter(
    (m) => !ts.isConstructorDeclaration(m) && !isStatic(m),
  );
  const ctor = node.members.find(ts.isConstructorDeclaration);
  if (ctor) {
    members.push(...ctor.parameters.filter(isParameterProperty));
  }
  return members.filter((m) => memberName(m) === name);
}

/** The nearest ancestor member named like `member`, if a superclass declares one. */
export function inheritedMember(
  checker: ts.TypeChecker,
  member: ts.Node,
): ts.Node | undefined {
  const name = memberName(member);
  if (name === undefined) {
    return undefined;
  }
  for (const ancestor of ancestors(checker, owningClass(member))) {
    const [found] = instanceMembers(ancestor, name);
    if (found) return found;
  }
  return undefined;
}

/**
 * Whether a superclass implements a method named like `member`: Haxe requires
 * `override` then, and rejects it over an `abstract` one.
 */
export function overridesImplementation(
  checker: ts.TypeChecker,
  member: ts.MethodDeclaration,
): boolean {
  const name = memberName(member);
  if (name === 'toString' && extendsLibError(checker, owningClass(member))) {
    return true;
  }
  return (
    name !== undefined &&
    ancestors(checker, owningClass(member)).some((ancestor) =>
      instanceMembers(ancestor, name).some(
        (m) =>
          ts.isMethodDeclaration(m) &&
          !!m.body &&
          !hasModifier(m, ts.ModifierFlags.Abstract),
      ),
    )
  );
}

/** The topmost declaration of a field a subclass may redeclare: the one Haxe declares. */
export function rootField(
  checker: ts.TypeChecker,
  field: FieldDeclaration,
): FieldDeclaration {
  let root = field;
  for (
    let inherited = inheritedMember(checker, root);
    inherited && isFieldDeclaration(inherited);
    inherited = inheritedMember(checker, root)
  ) {
    root = inherited;
  }
  return root;
}

/** The `super(...)` call statement at the top level of a constructor body. */
export function superCallStatement(
  ctor: ts.ConstructorDeclaration,
): ts.ExpressionStatement | undefined {
  return ctor.body?.statements.find(
    (s): s is ts.ExpressionStatement =>
      ts.isExpressionStatement(s) &&
      ts.isCallExpression(s.expression) &&
      s.expression.expression.kind === ts.SyntaxKind.SuperKeyword,
  );
}

/** Whether `ctor` assigns `this.<name>` in a statement at the top level of its body. */
export function assignsAtTopLevel(
  ctor: ts.ConstructorDeclaration | undefined,
  name: string,
): boolean {
  return (ctor?.body?.statements ?? []).some(
    (s) =>
      ts.isExpressionStatement(s) &&
      ts.isBinaryExpression(s.expression) &&
      s.expression.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      ts.isPropertyAccessExpression(s.expression.left) &&
      s.expression.left.expression.kind === ts.SyntaxKind.ThisKeyword &&
      s.expression.left.name.text === name,
  );
}

/** Whether `node` lets `this` escape: a method call on it, or `this` used as a value. */
function letsThisEscape(node: ts.Node): boolean {
  if (node.kind === ts.SyntaxKind.ThisKeyword) {
    const { parent } = node;
    if (!ts.isPropertyAccessExpression(parent) || parent.expression !== node) {
      return true;
    }
    return (
      ts.isCallExpression(parent.parent) && parent.parent.expression === parent
    );
  }
  return ts.forEachChild(node, letsThisEscape) ?? false;
}

/**
 * Whether code of a superclass may read this class's fields before they are
 * initialised (JS reads `undefined`): an ancestor's constructor or field initialiser
 * calls a method on `this` or lets `this` escape.
 */
export function mayReadFieldsBeforeInit(
  checker: ts.TypeChecker,
  node: ts.ClassLikeDeclaration,
): boolean {
  return ancestors(checker, node).some((ancestor) =>
    ancestor.members.some(
      (m) =>
        !isStatic(m) &&
        ((ts.isConstructorDeclaration(m) &&
          !!m.body &&
          letsThisEscape(m.body)) ||
          (ts.isPropertyDeclaration(m) &&
            !!m.initializer &&
            letsThisEscape(m.initializer))),
    ),
  );
}

/** Whether `node` assigns `this.<name>` anywhere, including compound assignments. */
function assignsThisField(node: ts.Node, name: string): boolean {
  if (
    ts.isBinaryExpression(node) &&
    node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment &&
    node.operatorToken.kind <= ts.SyntaxKind.LastAssignment &&
    ts.isPropertyAccessExpression(node.left) &&
    node.left.expression.kind === ts.SyntaxKind.ThisKeyword &&
    node.left.name.text === name
  ) {
    return true;
  }
  return (
    ts.forEachChild(node, (child) => assignsThisField(child, name)) ?? false
  );
}

/**
 * Whether a field redeclaration writes the field: it is mutable, has an initialiser,
 * is a parameter property, or its class's constructor assigns it.
 */
function writesRedeclaredField(field: FieldDeclaration): boolean {
  if (
    !hasModifier(field, ts.ModifierFlags.Readonly) ||
    isParameterProperty(field) ||
    field.initializer !== undefined
  ) {
    return true;
  }
  const name = memberName(field);
  const ctor = owningClass(field).members.find(ts.isConstructorDeclaration);
  return (
    name !== undefined && !!ctor?.body && assignsThisField(ctor.body, name)
  );
}

const writtenRedeclarationCache = new WeakMap<ts.Program, Set<ts.Node>>();

/**
 * Root field declarations (see `rootField`) that a subclass somewhere in the program
 * redeclares and writes (see `writesRedeclaredField`): Haxe declares those `var` even
 * when the root is `readonly`.
 */
export function redeclaredWrittenFields(program: ts.Program): Set<ts.Node> {
  const cached = writtenRedeclarationCache.get(program);
  if (cached) {
    return cached;
  }
  const checker = program.getTypeChecker();
  const result = new Set<ts.Node>();
  const visit = (node: ts.Node): void => {
    if (
      isFieldDeclaration(node) &&
      ts.isClassLike(owningClass(node)) &&
      writesRedeclaredField(node)
    ) {
      const root = rootField(checker, node);
      if (root !== node) {
        result.add(root);
      }
    }
    ts.forEachChild(node, visit);
  };
  program
    .getSourceFiles()
    .filter((sf) => !sf.isDeclarationFile)
    .forEach(visit);
  writtenRedeclarationCache.set(program, result);
  return result;
}

/**
 * Haxe name of a `#name` member: `__name`, plus `_<depth>` when an ancestor declares
 * the same private name (JS keeps both, Haxe forbids redeclaring a field).
 */
export function privateMemberName(
  checker: ts.TypeChecker,
  member: ts.NamedDeclaration & { name: ts.PrivateIdentifier },
): string {
  const base = `__${member.name.text.slice(1)}`;
  const owner = owningClass(member);
  const chain = ancestors(checker, owner);
  const shadows = chain.some((ancestor) =>
    ancestor.members.some(
      (m) =>
        m.name !== undefined &&
        ts.isPrivateIdentifier(m.name) &&
        m.name.text === member.name.text,
    ),
  );
  return shadows ? `${base}_${chain.length}` : base;
}

/** The `get` and `set` accessors of a class member name, static or not. */
export interface AccessorPair {
  get?: ts.GetAccessorDeclaration;
  set?: ts.SetAccessorDeclaration;
}

/** The accessors of `node` named `name` with the given staticness. */
export function accessorPair(
  node: ts.ClassLikeDeclaration,
  name: string,
  staticness: boolean,
): AccessorPair {
  const pair: AccessorPair = {};
  for (const member of node.members) {
    if (
      ts.isAccessor(member) &&
      isStatic(member) === staticness &&
      memberName(member) === name
    ) {
      if (ts.isGetAccessor(member)) pair.get = member;
      else pair.set = member;
    }
  }
  return pair;
}

/**
 * The topmost ancestor declaring what an accessor overrides: its accessor pair, or
 * `field` when it is an `abstract` property, which Haxe declares as a property with
 * storage whose `get_`/`set_` the accessors override.
 */
export interface InheritedAccessors {
  root: ts.ClassLikeDeclaration;
  pair: AccessorPair;
  field?: ts.PropertyDeclaration;
}

/** An `abstract` property: JS gives it no own property, so a subclass may implement it with accessors. */
export function isAbstractProperty(
  member: ts.Node,
): member is ts.PropertyDeclaration {
  return (
    ts.isPropertyDeclaration(member) &&
    hasModifier(member, ts.ModifierFlags.Abstract)
  );
}

const accessorImplementedCache = new WeakMap<ts.Program, Set<ts.Node>>();

/** `abstract` properties some subclass in the program implements with an accessor. */
export function accessorImplementedFields(program: ts.Program): Set<ts.Node> {
  const cached = accessorImplementedCache.get(program);
  if (cached) {
    return cached;
  }
  const checker = program.getTypeChecker();
  const result = new Set<ts.Node>();
  const visit = (node: ts.Node): void => {
    if (ts.isAccessor(node) && ts.isClassLike(node.parent) && !isStatic(node)) {
      const name = memberName(node);
      const inherited =
        name === undefined
          ? undefined
          : inheritedAccessors(checker, node.parent, name);
      if (inherited && inherited !== 'conflict' && inherited.field) {
        result.add(inherited.field);
      }
    }
    ts.forEachChild(node, visit);
  };
  program
    .getSourceFiles()
    .filter((sf) => !sf.isDeclarationFile)
    .forEach(visit);
  accessorImplementedCache.set(program, result);
  return result;
}

/**
 * The accessors (or `abstract` property) of ancestors overridden by an accessor named
 * `name`, or `conflict` when an ancestor declares another field or a method of that name.
 */
export function inheritedAccessors(
  checker: ts.TypeChecker,
  node: ts.ClassLikeDeclaration,
  name: string,
): InheritedAccessors | 'conflict' | undefined {
  let found: InheritedAccessors | undefined;
  for (const ancestor of ancestors(checker, node)) {
    const members = instanceMembers(ancestor, name);
    if (members.length === 0) continue;
    if (members.length === 1 && isAbstractProperty(members[0])) {
      found = { root: ancestor, pair: {}, field: members[0] };
      continue;
    }
    if (!members.every(ts.isAccessor)) {
      return 'conflict';
    }
    found = { root: ancestor, pair: accessorPair(ancestor, name, false) };
  }
  return found;
}

/** Whether an ancestor implements the accessor `kind` of `name` (Haxe needs `override`). */
export function overridesAccessor(
  checker: ts.TypeChecker,
  node: ts.ClassLikeDeclaration,
  name: string,
  kind: 'get' | 'set',
): boolean {
  return ancestors(checker, node).some((ancestor) => {
    const accessor = accessorPair(ancestor, name, false)[kind];
    return (
      !!accessor?.body && !hasModifier(accessor, ts.ModifierFlags.Abstract)
    );
  });
}

/** Whether TS gives `node` the contextual type of what it is assigned to. */
function isAssignedValue(node: ts.Expression): boolean {
  const { parent } = node;
  return (
    (ts.isVariableDeclaration(parent) && parent.initializer === node) ||
    ((ts.isCallExpression(parent) || ts.isNewExpression(parent)) &&
      ((parent.arguments ?? []) as readonly ts.Expression[]).includes(node)) ||
    ts.isReturnStatement(parent) ||
    ts.isArrayLiteralExpression(parent) ||
    (ts.isPropertyAssignment(parent) && parent.initializer === node) ||
    ts.isShorthandPropertyAssignment(parent) ||
    (ts.isPropertyDeclaration(parent) && parent.initializer === node) ||
    (ts.isParameter(parent) && parent.initializer === node) ||
    (ts.isBinaryExpression(parent) &&
      parent.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      parent.right === node) ||
    (ts.isArrowFunction(parent) && parent.body === node)
  );
}

/** The class declaration of a class instance type. */
function instanceClass(type: ts.Type): ts.ClassLikeDeclaration | undefined {
  const symbol = type.symbol;
  return symbol && symbol.flags & ts.SymbolFlags.Class
    ? symbol.declarations?.find(ts.isClassLike)
    : undefined;
}

/** The instance type of a class; the checker gives a class expression's constructor type at its node. */
export function classInstanceType(
  checker: ts.TypeChecker,
  node: ts.ClassLikeDeclaration,
): ts.Type {
  const type = checker.getTypeAtLocation(node);
  if (!ts.isClassExpression(node)) {
    return type;
  }
  const symbol = (type.isIntersection() ? type.types : [type])
    .map((part) => part.getSymbol())
    .find((candidate) => candidate?.declarations?.includes(node));
  return symbol ? checker.getDeclaredTypeOfSymbol(symbol) : type;
}

const structuralCache = new WeakMap<ts.Program, StructuralUse>();

/**
 * Optional members of structures a class is used as (through `implements` or an
 * assignment to a structure type) that the class lacks: Haxe adds them to the class
 * as `Null<T>` fields, since C# throws reading a missing field of a class instance
 * (ADR 0002). A member already added to an ancestor is not repeated.
 */
export function structuralOptionalMembers(
  program: ts.Program,
): Map<ts.ClassLikeDeclaration, Map<string, ts.Symbol>> {
  return structuralUse(program).optional;
}

/**
 * Optional structure members left off a class because a subclass declares a method
 * or accessor with that name, which Haxe forbids next to an inherited var.
 */
export function structuralMemberConflicts(
  program: ts.Program,
): Map<ts.ClassLikeDeclaration, Set<string>> {
  return structuralUse(program).conflicts;
}

/** Properties of structure types that some class used as that structure implements with an accessor. */
export function structuralAccessorMembers(
  program: ts.Program,
): ReadonlySet<ts.Symbol> {
  return structuralUse(program).accessorBacked;
}

interface StructuralUse {
  optional: Map<ts.ClassLikeDeclaration, Map<string, ts.Symbol>>;
  conflicts: Map<ts.ClassLikeDeclaration, Set<string>>;
  accessorBacked: Set<ts.Symbol>;
}

function structuralUse(program: ts.Program): StructuralUse {
  const cached = structuralCache.get(program);
  if (cached) {
    return cached;
  }
  const checker = program.getTypeChecker();
  const result = new Map<ts.ClassLikeDeclaration, Map<string, ts.Symbol>>();
  const accessorBacked = new Set<ts.Symbol>();
  const classes: ts.ClassLikeDeclaration[] = [];
  const record = (node: ts.ClassLikeDeclaration, target: ts.Type): void => {
    const structure = checker.getNonNullableType(target);
    if (structure.isUnion()) {
      structure.types.forEach((t) => record(node, t));
      return;
    }
    if (
      !(structure.flags & ts.TypeFlags.Object) ||
      instanceClass(structure) ||
      checker.isArrayLikeType(structure)
    ) {
      return;
    }
    const instance = classInstanceType(checker, node);
    for (const property of checker.getPropertiesOfType(structure)) {
      const own = checker.getPropertyOfType(instance, property.name);
      if (own && own.flags & ts.SymbolFlags.Accessor) {
        accessorBacked.add(property);
      }
      if (property.flags & ts.SymbolFlags.Optional && !own) {
        const members = result.get(node) ?? new Map<string, ts.Symbol>();
        members.set(property.name, property);
        result.set(node, members);
      }
    }
  };
  const visit = (node: ts.Node): void => {
    if (ts.isClassLike(node)) {
      classes.push(node);
      for (const clause of node.heritageClauses ?? []) {
        if (clause.token === ts.SyntaxKind.ImplementsKeyword) {
          clause.types.forEach((t) =>
            record(node, checker.getTypeAtLocation(t)),
          );
        }
      }
    } else if (ts.isExpression(node) && node.parent && isAssignedValue(node)) {
      const owner = instanceClass(checker.getTypeAtLocation(node));
      const contextual = owner && checker.getContextualType(node);
      if (owner && contextual) {
        record(owner, contextual);
      }
    }
    ts.forEachChild(node, visit);
  };
  program
    .getSourceFiles()
    .filter((sf) => !sf.isDeclarationFile)
    .forEach(visit);
  const conflicts = new Map<ts.ClassLikeDeclaration, Set<string>>();
  for (const node of classes) {
    for (const ancestor of ancestors(checker, node)) {
      const members = result.get(ancestor);
      for (const name of [...(members?.keys() ?? [])]) {
        if (
          instanceMembers(node, name).some(
            (m) => ts.isMethodDeclaration(m) || ts.isAccessor(m),
          )
        ) {
          members!.delete(name);
          const names = conflicts.get(ancestor) ?? new Set<string>();
          names.add(name);
          conflicts.set(ancestor, names);
        }
      }
    }
  }
  for (const [node, members] of result) {
    for (const ancestor of ancestors(checker, node)) {
      for (const name of result.get(ancestor)?.keys() ?? []) {
        members.delete(name);
      }
    }
  }
  const use = { optional: result, conflicts, accessorBacked };
  structuralCache.set(program, use);
  return use;
}

/** Whether an ancestor of `node` gets the optional member `name` added (see `structuralOptionalMembers`). */
export function inheritsStructuralMember(
  program: ts.Program,
  node: ts.ClassLikeDeclaration,
  name: string,
): boolean {
  const added = structuralOptionalMembers(program);
  return ancestors(program.getTypeChecker(), node).some(
    (ancestor) => added.get(ancestor)?.has(name) ?? false,
  );
}

/** A class Haxe declares at module level although TS does not: a class expression or a local class. */
export function isHoistedClass(node: ts.Node): node is ts.ClassLikeDeclaration {
  return (
    ts.isClassExpression(node) ||
    (ts.isClassDeclaration(node) && !ts.isSourceFile(node.parent))
  );
}

/** The class expression a `const` binds (`const C = class {}`), which Haxe declares as a class. */
export function boundClassExpression(
  declaration: ts.Node,
): ts.ClassExpression | undefined {
  if (
    !ts.isVariableDeclaration(declaration) ||
    !ts.isIdentifier(declaration.name) ||
    !declaration.initializer ||
    !(
      ts.isVariableDeclarationList(declaration.parent) &&
      declaration.parent.flags & ts.NodeFlags.Const
    )
  ) {
    return undefined;
  }
  let value: ts.Expression = declaration.initializer;
  while (ts.isParenthesizedExpression(value)) value = value.expression;
  return ts.isClassExpression(value) ? value : undefined;
}

/** The TS name a hoisted class is called after: its own, its binding's, or `Class`. */
export function hoistedClassName(node: ts.ClassLikeDeclaration): string {
  if (node.name) {
    return node.name.text;
  }
  const binding = ts.findAncestor(
    node.parent,
    (n) => !ts.isParenthesizedExpression(n),
  );
  return binding &&
    ts.isVariableDeclaration(binding) &&
    ts.isIdentifier(binding.name)
    ? binding.name.text
    : 'Class';
}

/** Whether `node` is written: an assignment target or the operand of `++`/`--`. */
export function isWriteTarget(node: ts.Expression): boolean {
  let child: ts.Node = node;
  let parent = node.parent;
  while (
    ts.isParenthesizedExpression(parent) ||
    ts.isNonNullExpression(parent)
  ) {
    child = parent;
    parent = parent.parent;
  }
  if (ts.isBinaryExpression(parent)) {
    const operator = parent.operatorToken.kind;
    return (
      parent.left === child &&
      operator >= ts.SyntaxKind.FirstAssignment &&
      operator <= ts.SyntaxKind.LastAssignment
    );
  }
  return (
    (ts.isPrefixUnaryExpression(parent) ||
      ts.isPostfixUnaryExpression(parent)) &&
    (parent.operator === ts.SyntaxKind.PlusPlusToken ||
      parent.operator === ts.SyntaxKind.MinusMinusToken)
  );
}

function isCallee(node: ts.Expression): boolean {
  return ts.isCallExpression(node.parent) && node.parent.expression === node;
}

/** The class a `this` in a static method, static initialiser or static block denotes. */
export function staticThisClass(
  node: ts.Node,
): ts.ClassLikeDeclaration | undefined {
  const container = ts.findAncestor(
    node.parent,
    (n) =>
      (ts.isFunctionLike(n) && !ts.isArrowFunction(n)) ||
      ts.isClassLike(n) ||
      ts.isPropertyDeclaration(n) ||
      ts.isClassStaticBlockDeclaration(n),
  );
  if (
    !container ||
    ts.isClassLike(container) ||
    !(ts.isClassStaticBlockDeclaration(container) || isStatic(container)) ||
    !ts.isClassLike(container.parent)
  ) {
    return undefined;
  }
  return container.parent;
}

/**
 * Why accessing a static through `receiver`, a class that inherits it, diverges
 * from JS, where `receiver` is the `this` of the access: a write creates an own
 * property of `receiver`, and an inherited static method run with `this` =
 * `receiver` may write through it, read a static `receiver` redeclares, or use
 * `this` as a value. `undefined` when the rewrite to the declaring class is exact.
 */
export function inheritedStaticDivergence(
  checker: ts.TypeChecker,
  access: ts.PropertyAccessExpression,
  receiver: ts.Type,
): string | undefined {
  if (isWriteTarget(access)) {
    return 'writing an inherited static through a subclass is not supported: in JS it creates a separate static of the subclass';
  }
  const method = checker.getSymbolAtLocation(access.name)?.valueDeclaration;
  return method &&
    ts.isMethodDeclaration(method) &&
    isCallee(access) &&
    staticThisDiverges(checker, method, receiver, new Set())
    ? 'calling an inherited static method through a subclass is not supported when the method writes a static through `this`, reads one the subclass redeclares or uses `this` as a value'
    : undefined;
}

function staticThisDiverges(
  checker: ts.TypeChecker,
  method: ts.MethodDeclaration,
  receiver: ts.Type,
  visited: Set<ts.MethodDeclaration>,
): boolean {
  if (!method.body || visited.has(method)) {
    return false;
  }
  visited.add(method);
  const diverges = (node: ts.Node): boolean => {
    if (node.kind !== ts.SyntaxKind.ThisKeyword) {
      return (
        !(ts.isFunctionLike(node) && !ts.isArrowFunction(node)) &&
        !ts.isClassLike(node) &&
        (ts.forEachChild(node, diverges) ?? false)
      );
    }
    const access = node.parent;
    if (!ts.isPropertyAccessExpression(access) || access.expression !== node) {
      return true;
    }
    const declared = checker.getSymbolAtLocation(access.name)?.valueDeclaration;
    const seen = ts.isIdentifier(access.name)
      ? checker.getPropertyOfType(receiver, access.name.text)?.valueDeclaration
      : undefined;
    if (!declared || declared !== seen || isWriteTarget(access)) {
      return true;
    }
    return (
      ts.isMethodDeclaration(declared) &&
      isCallee(access) &&
      staticThisDiverges(checker, declared, receiver, visited)
    );
  };
  return ts.forEachChild(method.body, diverges) ?? false;
}
