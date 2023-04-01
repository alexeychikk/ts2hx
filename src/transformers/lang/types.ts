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
  return this.toEitherType(node, context, node.types);
};

export const transformTupleType: TransformerFn = function (
  this: Transformer,
  node,
  context,
) {
  // myVar: [number, string]
  if (!ts.isTupleTypeNode(node)) return;
  if (node.elements.length > 3) return 'Dynamic';
  const res = this.toEitherType(node, context, node.elements);
  return res ? `Array<${res}>` : undefined;
};

export const transformPropertySignature: TransformerFn = function (
  this: Transformer,
  node,
  context,
) {
  // { foo: string; }
  if (!ts.isPropertySignature(node)) return;

  const isReadonly = node.modifiers?.find(
    (m) => m.kind === SyntaxKind.ReadonlyKeyword,
  );
  const isOptional = !!node.questionToken;
  const isInterface = ts.isInterfaceDeclaration(node.parent);

  return `${isOptional && isInterface ? '@:optional ' : ''}public ${
    isReadonly ? 'final' : 'var'
  } ${isOptional && !isInterface ? '?' : ''}${node.name.getText()}: ${
    node.type ? this.visitNode(node.type, context) : 'Any'
  };`;
};

export const transformMethodSignature: TransformerFn = function (
  this: Transformer,
  node,
  context,
) {
  // { myMethod(): void; }
  if (!ts.isMethodSignature(node)) return;

  const isOptional = !!node.questionToken;
  const generics = node.typeParameters
    ?.map((p) => this.visitNode(p, context))
    .join(', ');
  const params = node.parameters
    ?.map((p) => this.visitNode(p, context))
    .join(', ');
  const ret = this.visitNode(node.type, context) || 'Void';

  return `${
    isOptional ? '@:optional ' : ''
  }public function ${node.name.getText()}${generics ? `<${generics}>` : ''}(${
    params || ''
  }):${ret};`;
};
