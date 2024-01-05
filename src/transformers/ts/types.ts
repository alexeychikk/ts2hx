import ts from 'typescript';
import { type TransformerFn, type Transpiler } from '../Transpiler';

export const transformTemplateLiteralType: TransformerFn = function (
  this: Transpiler,
  node,
  context,
) {
  /* type A = 'foo' | 'bar';
     type B = `Hello ${A}`; */
  if (!ts.isTemplateLiteralTypeNode(node)) return;

  return context.factory.createKeywordTypeNode(ts.SyntaxKind.StringKeyword);
};

export const removeNonNullExpression: TransformerFn = function (
  this: Transpiler,
  node,
) {
  // foo!.bar
  if (!ts.isNonNullExpression(node)) return;

  return node.expression;
};

export const removeNonNullAssertion: TransformerFn = function (
  this: Transpiler,
  node,
  context,
) {
  if (ts.isVariableDeclaration(node)) {
    return context.factory.updateVariableDeclaration(
      node,
      node.name,
      undefined, // remove exclamationToken
      node.type,
      node.initializer,
    );
  }

  if (ts.isPropertyDeclaration(node)) {
    return context.factory.updatePropertyDeclaration(
      node,
      node.modifiers,
      node.name,
      node.questionToken, // replace with questionToken if available
      node.type,
      node.initializer,
    );
  }

  // TODO: ts.FunctionLikeDeclarationBase has optional exclamationToken
};

export const transformMappedType: TransformerFn = function (
  this: Transpiler,
  node,
  context,
) {
  // { [key in Foo]: number } ==> Map<Foo, number>
  if (!ts.isMappedTypeNode(node)) return;

  const keyNode =
    node.typeParameter.constraint ??
    context.factory.createKeywordTypeNode(ts.SyntaxKind.StringKeyword);

  const valueNode =
    (node.type && node.questionToken
      ? context.factory.createUnionTypeNode([
          node.type,
          context.factory.createKeywordTypeNode(ts.SyntaxKind.UndefinedKeyword),
        ])
      : node.type) ??
    context.factory.createTypeReferenceNode(
      context.factory.createIdentifier('Any'),
    );

  return context.factory.createTypeReferenceNode(
    context.factory.createIdentifier('Map'),
    [keyNode, valueNode],
  );
};
