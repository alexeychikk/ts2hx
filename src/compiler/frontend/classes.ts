import ts from 'typescript';

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
