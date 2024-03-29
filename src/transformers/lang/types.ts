import ts, { SyntaxKind } from 'typescript';
import { type Transpiler, type EmitFn } from '../Transpiler';
import { TranspilerError } from '../../utils';
import { logger } from '../../Logger';

export const transformLiteralTypes: EmitFn = function (this: Transpiler, node) {
  if (!ts.isLiteralTypeNode(node)) return;
  // myVar: 42
  if (
    ts.isNumericLiteral(node.literal) ||
    // myVar: -1
    (ts.isPrefixUnaryExpression(node.literal) &&
      ts.isNumericLiteral(node.literal.operand))
  ) {
    return 'Float';
  }
  // myVar: "Hello"
  if (ts.isStringLiteral(node.literal)) {
    return 'String';
  }
  // myVar: true
  if (
    node.literal.kind === SyntaxKind.TrueKeyword ||
    node.literal.kind === SyntaxKind.FalseKeyword
  ) {
    return 'Bool';
  }
  // myVar: null
  if (node.literal.kind === SyntaxKind.NullKeyword) {
    return 'Null<Any>';
  }
};

export const transformArrayType: EmitFn = function (
  this: Transpiler,
  node,
  context,
) {
  // myVar: number[]
  if (!ts.isArrayTypeNode(node)) return;
  return `Array<${this.emitNode(node.elementType, context)}>`;
};

export const transformUnionType: EmitFn = function (
  this: Transpiler,
  node,
  context,
) {
  // myVar: string | boolean
  if (!ts.isUnionTypeNode(node)) return;
  return this.utils.toEitherType(node.types, context);
};

export const transformTupleType: EmitFn = function (
  this: Transpiler,
  node,
  context,
) {
  // myVar: [number, string]
  if (!ts.isTupleTypeNode(node)) return;
  const res = this.utils.toEitherType(node.elements, context);
  return `Array<${res}>`;
};

export const transformPropertySignature: EmitFn = function (
  this: Transpiler,
  node,
  context,
) {
  // { foo: string; }
  if (!ts.isPropertySignature(node)) return;

  if (ts.isComputedPropertyName(node.name)) {
    logger.warn(
      `Computed property name is not supported in property signature at`,
      this.utils.getNodeSourcePath(node.name),
    );
    return this.utils.commentOutNode(node);
  }

  const isOptional = !!node.questionToken;
  const isInterface = ts.isInterfaceDeclaration(node.parent);

  return `${
    isOptional && isInterface ? '@:optional ' : ''
  }public ${this.utils.getDeclarationKeyword(node)} ${
    isOptional && !isInterface ? '?' : ''
  }${this.emitNode(node.name, context).trim()}: ${
    node.type ? this.emitNode(node.type, context) : 'Any'
  };`;
};

export const transformPropertyName: EmitFn = function (this: Transpiler, node) {
  if (!ts.isPropertyName(node)) return;

  if (
    ts.isIdentifier(node) ||
    ts.isStringLiteral(node) ||
    ts.isNoSubstitutionTemplateLiteral(node) ||
    ts.isNumericLiteral(node) ||
    ts.isPrivateIdentifier(node)
  ) {
    return this.utils.toHaxeIdentifier(node.text);
  }

  if (ts.isComputedPropertyName(node)) {
    throw new TranspilerError(
      `ComputedPropertyName must be handled by parent's node transformer`,
      node,
    );
  }
};

export const transformIndexSignature: EmitFn = function (
  this: Transpiler,
  node,
) {
  // { [key: string]: number; }
  if (!ts.isIndexSignatureDeclaration(node)) return;

  return this.utils.commentOutNode(node, `Index signature is not supported`);
};

export const transformMethodSignature: EmitFn = function (
  this: Transpiler,
  node,
  context,
) {
  // { myMethod(): void; }
  if (!ts.isMethodSignature(node)) return;

  const isOptional = !!node.questionToken;
  const typeParams = this.utils.joinTypeParameters(
    node.typeParameters,
    context,
  );
  const params = this.utils.joinNodes(node.parameters, context);
  const ret = node.type ? this.emitNode(node.type, context) : 'Void';

  return `${
    isOptional ? '@:optional ' : ''
  }public function ${node.name.getText()}${typeParams}(${
    params || ''
  }):${ret};`;
};

export const transformConstructorSignature: EmitFn = function (
  this: Transpiler,
  node,
  context,
) {
  // { new(): MyClass; }
  if (!ts.isConstructSignatureDeclaration(node)) return;

  return this.utils.commentOutNode(
    node,
    `Constructor signature is not supported`,
  );
};

export const transformTypeParameter: EmitFn = function (
  this: Transpiler,
  node,
  context,
) {
  // <T extends string> (without angle brackets)
  if (!ts.isTypeParameterDeclaration(node)) return;

  let constraint = node.constraint
    ? this.emitNode(node.constraint, context)
    : undefined;
  if (!constraint && node.default) {
    constraint = this.emitNode(node.default, context);
  }
  if (constraint) constraint = ` : ${constraint}`;

  return `${node.name.getText()}${constraint ?? ''}`;
};

export const transformConditionalType: EmitFn = function (
  this: Transpiler,
  node,
  context,
) {
  // T extends Foo ? string : number
  if (!ts.isConditionalTypeNode(node)) return;

  const comment = this.utils.commentOutNode(
    node,
    `Conditional type is not supported`,
  );
  return `${comment} Any`;
};

export const transformTypeQuery: EmitFn = function (
  this: Transpiler,
  node,
  context,
) {
  // type T = typeof MY_VAR
  if (!ts.isTypeQueryNode(node)) return;

  const comment = this.utils.commentOutNode(
    node,
    `typeof type query is not supported`,
  );
  return `${comment} Any`;
};

export const transformEnumDeclaration: EmitFn = function (
  this: Transpiler,
  node,
  context,
) {
  // enum Foo { Bar, Baz }
  if (!ts.isEnumDeclaration(node)) return;

  const firstInitializer = node.members[0]?.initializer;
  const underlyingType =
    !!firstInitializer &&
    this.utils.getNodeTypeString(firstInitializer, context) === 'String'
      ? 'String'
      : 'Int';

  const members = node.members
    .map((member) => {
      const initializer = member.initializer
        ? ` = ${this.emitNode(member.initializer, context)}`
        : '';
      return `${this.utils.getIndent(
        node,
      )}  var ${member.name.getText()}${initializer};`;
    })
    .join('\n');

  return `enum abstract ${this.utils.toHaxeIdentifier(
    node.name.text,
  )}(${underlyingType}) from ${underlyingType} to ${underlyingType} {\n${members}\n}`;
};

export const transformIndexedAccessType: EmitFn = function (
  this: Transpiler,
  node,
  context,
) {
  // type FooBar = Foo['bar'];
  if (!ts.isIndexedAccessTypeNode(node)) return;

  return this.utils.getNodeTypeString(node, context);
};

export const transformAsExpression: EmitFn = function (
  this: Transpiler,
  node,
  context,
) {
  if (!ts.isAsExpression(node)) return;

  // as const
  if (
    ts.isTypeReferenceNode(node.type) &&
    node.type.typeName.getText() === 'const'
  ) {
    return this.emitNode(node.expression, context);
  }

  // myVar = hisVar as T
  if (!ts.isParenthesizedExpression(node.parent)) {
    return `(${this.traverseChildren(node, context)})`;
  }
};
