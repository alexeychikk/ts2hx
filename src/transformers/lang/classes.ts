import ts, { SymbolFlags, SyntaxKind } from 'typescript';
import { logger } from '../../Logger';
import {
  type VisitNodeContext,
  type Transformer,
  type TransformerFn,
} from '../Transformer';

export const transformClassDeclaration: TransformerFn = function (
  this: Transformer,
  node,
  context,
) {
  if (!ts.isClassDeclaration(node)) return;

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
  this: Transformer,
  node: ts.ClassDeclaration,
  context: VisitNodeContext,
): string {
  if (this.utils.isAbstract(node)) return '';

  const hasConstructor = node.members.find((m) =>
    ts.isConstructorDeclaration(m),
  );
  if (hasConstructor) return '';

  const emptyConstructor = `\n${this.utils.getIndent(
    node,
  )}  public function new() {}\n`;

  const baseClass = this.utils.getExtendedNode(node);
  if (!baseClass) return emptyConstructor;

  const parentConstructor = findParentConstructor.call(this, baseClass);
  if (!parentConstructor) return emptyConstructor;

  const params = this.utils.joinNodes(parentConstructor.parameters, {
    ...context,
    enforceParameterType: true,
    skipParameterInitializer: true,
  });
  const superParams = parentConstructor.parameters
    .map((p) => p.name.getText())
    .join(', ');
  return `\n${this.utils.getIndent(
    node,
  )}  public function new(${params}) {\nsuper(${superParams});}\n`;
};

const findParentConstructor = function (
  this: Transformer,
  node: ts.Node,
): ts.ConstructorDeclaration | undefined {
  const classType = this.typeChecker.getTypeAtLocation(node);
  const symbol = classType.aliasSymbol ?? classType.symbol;
  const members = Array.from(symbol.members?.values() ?? []);

  const constructorSymbol = members.find(
    (symbol) => symbol.flags & SymbolFlags.Constructor,
  );
  if (constructorSymbol) {
    return constructorSymbol.declarations?.[0] as ts.ConstructorDeclaration;
  }

  const [declaration] = symbol.declarations ?? [];
  const baseClass = this.utils.getExtendedNode(
    declaration as ts.ClassDeclaration,
  );
  if (!baseClass) return;

  return findParentConstructor.call(this, baseClass);
};

export const transformHeritageClause: TransformerFn = function (
  this: Transformer,
  node,
  context,
) {
  // extends A, B, C
  if (!ts.isHeritageClause(node)) return;

  const keyword =
    node.token === SyntaxKind.ExtendsKeyword ? 'extends' : 'implements';

  return node.types
    .map((t) => `${keyword} ${this.visitNode(t, context)}`)
    .join(' ');
};

export const transformConstructor: TransformerFn = function (
  this: Transformer,
  node,
  context,
) {
  // constructor() {}
  if (
    !(ts.isConstructorDeclaration(node) && ts.isClassDeclaration(node.parent))
  )
    return;

  const modifiers = this.utils.joinMemberModifiers(node, context);

  let propertyDeclarations = '';
  let propertyInitializations = '';

  const params = node.parameters
    .map((param) => {
      const access = this.utils.getAccessModifier(param);
      const code = this.visitNode(param, context);
      if (access) {
        propertyDeclarations += `${this.visitNode(
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
          let code = this.visitNode(statement, context);
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

export const transformClassPropertyDeclaration: TransformerFn = function (
  this: Transformer,
  node,
  context,
) {
  // foo?: string = "bar";
  if (!(ts.isPropertyDeclaration(node) && ts.isClassDeclaration(node.parent)))
    return;

  if (ts.isComputedPropertyName(node.name)) {
    return this.utils.commentOutNode(
      node,
      `Computed property name is not supported in class property declaration at`,
    );
  }

  const modifiers = this.utils.joinMemberModifiers(node, context);

  let type = '';
  if (node.type) {
    type = this.visitNode(node.type, context);
    if (node.questionToken) type = `Null<${type}>`;
    type = `: ${type}`;
  }

  const initializer = node.initializer
    ? `= ${this.visitNode(node.initializer, context)}`
    : '';

  return `${modifiers}${this.utils.getDeclarationKeyword(
    node,
  )} ${node.name.getText()}${type}${initializer};`;
};

export const transformClassMethodDeclaration: TransformerFn = function (
  this: Transformer,
  node,
  context,
) {
  // public static main(): void {}
  if (!(ts.isMethodDeclaration(node) && ts.isClassDeclaration(node.parent)))
    return;

  const modifiers = this.utils.joinMemberModifiers(node, context);
  const typeParams = this.utils.joinTypeParameters(
    node.typeParameters,
    context,
  );
  const params = this.utils.joinNodes(node.parameters, context);
  const returnType = node.type ? `: ${this.visitNode(node.type, context)}` : '';
  const body = node.body ? this.visitNode(node.body, context) : ';';

  return `${modifiers}function ${node.name.getText()}${typeParams}(${params})${returnType}${body}`;
};

export const transformClassGetter: TransformerFn = function (
  this: Transformer,
  node,
  context,
) {
  // get prop(): string {}
  if (!(ts.isGetAccessor(node) && ts.isClassDeclaration(node.parent))) return;

  const modifiers = this.utils.joinMemberModifiers(node, context);
  const type = node.type ? `: ${this.visitNode(node.type, context)}` : '';
  const body = node.body ? this.visitNode(node.body, context) : ';';
  const property = defineHaxeGetSetProperty.call(this, node, context);

  return `${property}${modifiers}function get_${node.name.getText()}()${type}${body}`;
};

export const transformClassSetter: TransformerFn = function (
  this: Transformer,
  node,
  context,
) {
  // set prop(value: string) {}
  if (!(ts.isSetAccessor(node) && ts.isClassDeclaration(node.parent))) return;

  const modifiers = this.utils.joinMemberModifiers(node, context);
  const params = this.utils.joinNodes(node.parameters, context);
  const body = node.body ? this.visitNode(node.body, context) : ';';
  const property = defineHaxeGetSetProperty.call(this, node, context);

  return `${property}${modifiers}function set_${node.name.getText()}(${params})${body}`;
};

const defineHaxeGetSetProperty = function (
  this: Transformer,
  node: ts.GetAccessorDeclaration | ts.SetAccessorDeclaration,
  context: VisitNodeContext,
): string {
  const classNode = node.parent as ts.ClassDeclaration;
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
    ? this.visitNode(getter.type, context)
    : setter?.parameters[0].type
    ? this.visitNode(setter.parameters[0].type, context)
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
