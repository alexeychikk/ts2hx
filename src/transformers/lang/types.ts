import ts, { SyntaxKind } from 'typescript';
import { type Transformer, type TransformerFn } from '../Transformer';

export const transformLiteralTypes: TransformerFn = function (
  this: Transformer,
  node,
) {
  if (!ts.isLiteralTypeNode(node)) return;
  // myVar: 42
  if (ts.isNumericLiteral(node.literal)) {
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
    return 'Null<Void>';
  }
};

export const transformArrayType: TransformerFn = function (
  this: Transformer,
  node,
  context,
) {
  // myVar: number[]
  if (!ts.isArrayTypeNode(node)) return;
  return `Array<${this.visitNode(node.elementType, context)}>`;
};

export const transformUnionType: TransformerFn = function (
  this: Transformer,
  node,
  context,
) {
  // myVar: string | boolean
  if (!ts.isUnionTypeNode(node)) return;
  if (node.types.length > 3) return 'Dynamic';
  return this.utils.toEitherType(node.types, context);
};

export const transformTupleType: TransformerFn = function (
  this: Transformer,
  node,
  context,
) {
  // myVar: [number, string]
  if (!ts.isTupleTypeNode(node)) return;
  if (node.elements.length > 3) return 'Dynamic';
  const res = this.utils.toEitherType(node.elements, context);
  return res ? `Array<${res}>` : undefined;
};

export const transformPropertySignature: TransformerFn = function (
  this: Transformer,
  node,
  context,
) {
  // { foo: string; }
  if (!ts.isPropertySignature(node)) return;

  const isOptional = !!node.questionToken;
  const isInterface = ts.isInterfaceDeclaration(node.parent);

  return `${
    isOptional && isInterface ? '@:optional ' : ''
  }public ${this.utils.getDeclarationKeyword(node)} ${
    isOptional && !isInterface ? '?' : ''
  }${node.name.getText()}: ${
    node.type ? this.visitNode(node.type, context) : 'Any'
  };`;
};

export const transformIndexSignature: TransformerFn = function (
  this: Transformer,
  node,
) {
  // { [key: string]: number; }
  if (!ts.isIndexSignatureDeclaration(node)) return;

  return this.utils.commentOutNode(node, `Index signature is not supported at`);
};

export const transformMethodSignature: TransformerFn = function (
  this: Transformer,
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
  const ret = node.type ? this.visitNode(node.type, context) : 'Void';

  return `${
    isOptional ? '@:optional ' : ''
  }public function ${node.name.getText()}${typeParams}(${
    params || ''
  }):${ret};`;
};

export const transformConstructorSignature: TransformerFn = function (
  this: Transformer,
  node,
  context,
) {
  // { new(): MyClass; }
  if (!ts.isConstructSignatureDeclaration(node)) return;

  return this.utils.commentOutNode(
    node,
    `Constructor signature is not supported at`,
  );
};

export const transformTypeParameter: TransformerFn = function (
  this: Transformer,
  node,
  context,
) {
  // <T extends string> (without angle brackets)
  if (!ts.isTypeParameterDeclaration(node)) return;

  let constraint = node.constraint
    ? this.visitNode(node.constraint, context)
    : undefined;
  if (!constraint && node.default) {
    constraint = this.visitNode(node.default, context);
  }
  if (constraint) constraint = ` : ${constraint}`;

  return `${node.name.getText()}${constraint ?? ''}`;
};

export const transformConditionalType: TransformerFn = function (
  this: Transformer,
  node,
  context,
) {
  // T extends Foo ? string : number
  if (!ts.isConditionalTypeNode(node)) return;

  const comment = this.utils.commentOutNode(
    node,
    `Conditional type is not supported at`,
  );
  return `${comment} Any`;
};

export const transformTypeQuery: TransformerFn = function (
  this: Transformer,
  node,
  context,
) {
  // type T = typeof MY_VAR
  if (!ts.isTypeQueryNode(node)) return;

  const comment = this.utils.commentOutNode(
    node,
    `typeof type query is not supported at`,
  );
  return `${comment} Any`;
};

export const transformEnumDeclaration: TransformerFn = function (
  this: Transformer,
  node,
  context,
) {
  // enum Foo { Bar, Baz }
  if (!ts.isEnumDeclaration(node)) return;

  const firstInitializer = node.members[0]?.initializer;
  const underlyingType =
    !!firstInitializer &&
    this.utils.getSimpleTypeString(firstInitializer) === 'string'
      ? 'String'
      : 'Int';

  const members = node.members
    .map((member) => {
      const initializer = member.initializer
        ? ` = ${this.visitNode(member.initializer, context)}`
        : '';
      return `${this.utils.getIndent(
        node,
      )}  var ${member.name.getText()}${initializer};`;
    })
    .join('\n');

  return `enum abstract ${node.name.text}(${underlyingType}) from ${underlyingType} to ${underlyingType} {\n${members}\n}`;
};
