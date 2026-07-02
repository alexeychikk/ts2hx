import ts, { SyntaxKind } from 'typescript';
import { logger } from '../../Logger';
import {
  type VisitNodeContext,
  type Transpiler,
  type EmitFn,
} from '../Transpiler';

export const transformClassDeclaration: EmitFn = function (
  this: Transpiler,
  node,
  context,
) {
  if (!ts.isClassLike(node)) return;

  const modifiers = this.utils.joinModifiers(node.modifiers, context);
  const className =
    node.name?.getText() ?? `AnonymousClass_${this.anonymousClassCounter++}`;
  const typeParams = this.utils.joinTypeParameters(
    node.typeParameters,
    context,
  );
  const inheritance = this.utils.joinNodes(node.heritageClauses, context, ' ');

  return (
    `${modifiers}class ${className}${typeParams} ${inheritance} {` +
    getDefaultConstructor.call(this, node, context) +
    this.utils.joinNodes(node.members, context, '') +
    `\n${this.utils.getIndent(node)}}`
  );
};

const getDefaultConstructor = function (
  this: Transpiler,
  node: ts.ClassLikeDeclaration,
  context: VisitNodeContext,
): string {
  if (this.utils.isAbstract(node)) return '';

  const hasConstructor = node.members.find((m) =>
    ts.isConstructorDeclaration(m),
  );
  if (hasConstructor) return '';

  const baseClass = this.utils.getExtendedNode(node);
  if (baseClass) return '';

  return `\n${this.utils.getIndent(node)}  public function new() {}\n`;
};

export const transformHeritageClause: EmitFn = function (
  this: Transpiler,
  node,
  context,
) {
  // extends A, B, C
  if (!ts.isHeritageClause(node)) return;

  const keyword =
    node.token === SyntaxKind.ExtendsKeyword ? 'extends' : 'implements';

  return node.types
    .map((t) => {
      // types mapped by other emitters (Error => Exception)
      if (ts.isIdentifier(t.expression) && t.expression.text === 'Error') {
        return `${keyword} ${this.emitNode(t, context)}`;
      }
      // external base types have no Haxe counterpart —
      // extending them would produce invalid code
      const declarations = this.utils.getRootSymbol(t.expression)?.declarations;
      const isExternal = !!declarations?.every((declaration) =>
        /[\\/]node_modules[\\/]/.test(declaration.getSourceFile().fileName),
      );
      // TS allows implementing structural types (type aliases) — Haxe
      // requires a real interface, and structural typing covers the
      // contract anyway
      const isStructural =
        keyword === 'implements' &&
        !!declarations?.some(ts.isTypeAliasDeclaration);
      if (isExternal || isStructural) {
        logger.warn(
          `Heritage clause with ${
            isExternal ? 'an external type' : 'a structural type'
          } is not supported at`,
          this.utils.getNodeSourcePath(t),
        );
        return this.utils.createComment(
          ({ todo }) => `${todo} ${keyword} ${t.getText()}`,
        );
      }
      return `${keyword} ${this.emitNode(t, context)}`;
    })
    .join(' ');
};

export const transformConstructor: EmitFn = function (
  this: Transpiler,
  node,
  context,
) {
  // constructor() {}
  if (!(ts.isConstructorDeclaration(node) && ts.isClassLike(node.parent)))
    return;

  const modifiers = this.utils.joinModifiers(node.modifiers, context);

  let propertyDeclarations = '';
  let propertyInitializations = '';

  const params = node.parameters
    .map((param) => {
      const access = this.utils.getAccessModifier(param);
      const code = this.emitNode(param, context);
      if (access) {
        propertyDeclarations += `${this.emitNode(
          access,
          context,
        )} ${this.utils.getDeclarationKeyword(param)} ${code};\n`;
        const paramName = param.name.getText();
        propertyInitializations += `${this.utils.getIndent(
          node,
        )}  this.${paramName} = ${paramName};\n`;
      }
      return code;
    })
    .join(', ');

  if (propertyDeclarations) {
    propertyDeclarations += this.utils.getIndent(node);
  }
  if (propertyInitializations) {
    propertyInitializations = '\n' + propertyInitializations;
  }

  let superCallFound = false;
  let body = node.body
    ? node.body.statements
        .map((statement) => {
          let code = this.emitNode(statement, context);
          if (this.utils.isSuperExpression(statement)) {
            superCallFound = true;
            code += propertyInitializations;
          }
          return code;
        })
        .join('\n')
    : propertyInitializations;

  if (!superCallFound) {
    body = propertyInitializations + body;
  }

  return `${propertyDeclarations}${modifiers}function new(${params}) {${body}\n${this.utils.getIndent(
    node,
  )}}`;
};

export const transformClassPropertyDeclaration: EmitFn = function (
  this: Transpiler,
  node,
  context,
) {
  // foo?: string = "bar";
  if (!(ts.isPropertyDeclaration(node) && ts.isClassLike(node.parent))) return;

  if (ts.isComputedPropertyName(node.name)) {
    return this.utils.commentOutNode(
      node,
      `Computed property name is not supported in class property declaration`,
    );
  }

  const modifiers = this.utils.joinModifiers(node.modifiers, context);

  let type = '';
  if (node.type) {
    type = this.emitNode(node.type, context);
    if (node.questionToken) type = `Null<${type}>`;
    type = `: ${type}`;
  }

  const initializer = node.initializer
    ? `= ${this.emitNode(node.initializer, context)}`
    : '';

  return `${modifiers}${this.utils.getDeclarationKeyword(
    node,
  )} ${getStaticMemberName.call(this, node)}${type}${initializer};`;
};

/**
 * Haxe forbids a static member sharing its name with an instance member
 * (own or inherited) — such statics are renamed to static_<name>
 */
const hasStaticInstanceConflict = function (
  this: Transpiler,
  classNode: ts.ClassLikeDeclaration,
  memberName: string,
): boolean {
  if (!classNode.name || classNode.name.pos === -1) return false;
  try {
    const classSymbol = this.typeChecker.getSymbolAtLocation(classNode.name);
    if (!classSymbol) return false;
    const instanceType = this.typeChecker.getDeclaredTypeOfSymbol(classSymbol);
    return !!instanceType.getProperty(memberName);
  } catch {
    return false;
  }
};

const getStaticMemberName = function (
  this: Transpiler,
  node: ts.PropertyDeclaration | ts.MethodDeclaration,
): string {
  const name = node.name.getText();
  const isStatic = !!node.modifiers?.some(
    (modifier) => modifier.kind === SyntaxKind.StaticKeyword,
  );
  if (
    isStatic &&
    ts.isClassLike(node.parent) &&
    hasStaticInstanceConflict.call(this, node.parent, name)
  ) {
    return `static_${name}`;
  }
  return name;
};

/** ClassWithConflict.member ==> ClassWithConflict.static_member */
export const transformConflictingStaticAccess: EmitFn = function (
  this: Transpiler,
  node,
  context,
) {
  if (!ts.isPropertyAccessExpression(node)) return;
  if (node.name.pos === -1) return;

  let symbol: ts.Symbol | undefined;
  try {
    symbol = this.typeChecker.getSymbolAtLocation(node.name);
  } catch {
    return;
  }
  const declaration = symbol?.declarations?.find(
    (dec): dec is ts.PropertyDeclaration | ts.MethodDeclaration =>
      (ts.isPropertyDeclaration(dec) || ts.isMethodDeclaration(dec)) &&
      !!dec.modifiers?.some(
        (modifier) => modifier.kind === SyntaxKind.StaticKeyword,
      ),
  );
  if (!declaration || !ts.isClassLike(declaration.parent)) return;
  if (
    !hasStaticInstanceConflict.call(this, declaration.parent, node.name.text)
  ) {
    return;
  }

  return `${this.emitNode(node.expression, context).trim()}.static_${
    node.name.text
  }`;
};

/** Haxe requires an explicit `override` on inherited methods */
const getOverrideModifier = function (
  this: Transpiler,
  node: ts.MethodDeclaration,
): string {
  if (node.modifiers?.some((m) => m.kind === SyntaxKind.StaticKeyword)) {
    return '';
  }
  const classNode = node.parent as ts.ClassLikeDeclaration;
  const baseNode = this.utils.getExtendedNode(classNode);
  if (!baseNode || baseNode.pos === -1 || node.name.pos === -1) return '';
  try {
    const baseType = this.typeChecker.getTypeAtLocation(baseNode);
    const baseProperty = baseType.getProperty(node.name.getText());
    const declarations = baseProperty?.declarations;
    if (!declarations?.length) return '';
    // implementations of abstract methods are not overrides in Haxe
    if (
      declarations.some(
        (declaration) =>
          ts.canHaveModifiers(declaration) &&
          declaration.modifiers?.some(
            (modifier) => modifier.kind === SyntaxKind.AbstractKeyword,
          ),
      )
    ) {
      return '';
    }
    // methods inherited from the TS lib (e.g. Object.toString) are not
    // Haxe fields — except when extending Error, which maps to Exception
    const isExternal = declarations.every((declaration) =>
      /[\\/]node_modules[\\/]/.test(declaration.getSourceFile().fileName),
    );
    if (
      isExternal &&
      !(
        ts.isIdentifier(
          (baseNode as ts.ExpressionWithTypeArguments).expression,
        ) &&
        (
          (baseNode as ts.ExpressionWithTypeArguments)
            .expression as ts.Identifier
        ).text === 'Error'
      )
    ) {
      return '';
    }
    return 'override ';
  } catch {
    return '';
  }
};

export const transformClassMethodDeclaration: EmitFn = function (
  this: Transpiler,
  node,
  context,
) {
  // public static main(): void {}
  if (!(ts.isMethodDeclaration(node) && ts.isClassLike(node.parent))) return;

  // optional methods become nullable fields of a function type:
  // foo?(bar: string): void; ==> public var foo: Null<(bar: String) -> Void>;
  if (node.questionToken && !node.body) {
    const params = this.utils.joinNodes(node.parameters, {
      ...context,
      skipParameterInitializer: true,
    });
    const returnType = node.type
      ? this.emitNode(node.type, context).trim()
      : 'Void';
    return `${this.utils.joinModifiers(
      node.modifiers,
      context,
    )}var ${node.name.getText()}: Null<(${params}) -> ${returnType}> = null;`;
  }

  const modifiers =
    this.utils.joinModifiers(node.modifiers, context) +
    getOverrideModifier.call(this, node);
  const typeParams = this.utils.joinTypeParameters(
    node.typeParameters,
    context,
  );
  const params = this.utils.joinNodes(node.parameters, context);
  const returnType = node.type ? `: ${this.emitNode(node.type, context)}` : '';
  const body = node.body ? this.emitNode(node.body, context) : ';';

  return `${modifiers}function ${getStaticMemberName.call(
    this,
    node,
  )}${typeParams}(${params})${returnType}${body}`;
};

export const transformClassGetter: EmitFn = function (
  this: Transpiler,
  node,
  context,
) {
  // get prop(): string {}
  if (!(ts.isGetAccessor(node) && ts.isClassLike(node.parent))) return;

  const modifiers = this.utils.joinModifiers(node.modifiers, context);
  const type = node.type ? `: ${this.emitNode(node.type, context)}` : '';
  const body = node.body ? this.emitNode(node.body, context) : ';';
  const property = defineHaxeGetSetProperty.call(this, node, context);

  return `${property}${modifiers}function get_${node.name.getText()}()${type}${body}`;
};

export const transformClassSetter: EmitFn = function (
  this: Transpiler,
  node,
  context,
) {
  // set prop(value: string) {}
  if (!(ts.isSetAccessor(node) && ts.isClassLike(node.parent))) return;

  const modifiers = this.utils.joinModifiers(node.modifiers, context);
  const params = this.utils.joinNodes(node.parameters, context);

  let body = ';'; // abstract setters do not have body
  if (node.body) {
    const hasReturn = node.body.statements.some((st) =>
      ts.isReturnStatement(st),
    );
    if (hasReturn) {
      // unlikely, compiler prevents this
      body = this.emitNode(node.body, context);
    } else {
      const lastStatement =
        node.body.statements[node.body.statements.length - 1];
      this.utils.ignoreChildrenOfKind(lastStatement, SyntaxKind.SemicolonToken);
      body = node.body.statements
        .map((st) => {
          const code = this.emitNode(st, context);
          return st === lastStatement ? `return (${code});` : code;
        })
        .join('\n');
      body = `{${body}}`;
    }
  }

  const property = defineHaxeGetSetProperty.call(this, node, context);

  return `${property}${modifiers}function set_${node.name.getText()}(${params})${body}`;
};

const defineHaxeGetSetProperty = function (
  this: Transpiler,
  node: ts.GetAccessorDeclaration | ts.SetAccessorDeclaration,
  context: VisitNodeContext,
): string {
  const classNode = node.parent as ts.ClassLikeDeclaration;
  const indexInClass = classNode.members.findIndex((el) => el === node);
  const indexOfPair = classNode.members.findIndex(
    (el) => el !== node && el.name?.getText() === node.name.getText(),
  );
  const pairNode = classNode.members[indexOfPair];
  if (pairNode && indexOfPair < indexInClass) {
    // get-set property was already declared
    return '';
  }

  const getter = ts.isGetAccessor(node)
    ? node
    : (pairNode as ts.GetAccessorDeclaration | undefined);
  const setter = ts.isSetAccessor(node)
    ? node
    : (pairNode as ts.SetAccessorDeclaration | undefined);
  const getAccess = getter
    ? this.utils.getAccessModifierString(node)
    : undefined;
  const setAccess = setter
    ? this.utils.getAccessModifierString(node)
    : undefined;
  const commonAccess =
    getAccess === 'public' || setAccess === 'public' ? 'public' : 'private';
  const type = getter?.type
    ? this.emitNode(getter.type, context)
    : setter?.parameters[0].type
    ? this.emitNode(setter.parameters[0].type, context)
    : `${this.utils.createTodoComment()} Any`;

  if (type === 'Any') {
    logger.warn(
      `Type of get/set could not be inferred at`,
      this.utils.getNodeSourcePath(node),
    );
  }

  return `${commonAccess} var ${node.name.getText()}(${
    getter ? 'get' : 'never'
  }, ${setter ? 'set' : 'never'}): ${type};\n${this.utils.getIndent(node)}`;
};
