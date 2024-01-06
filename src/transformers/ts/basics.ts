import ts, { SyntaxKind } from 'typescript';
import { type TransformerFn, type Transpiler } from '../Transpiler';

export const transformPowExpression: TransformerFn = function (
  this: Transpiler,
  node,
  context,
) {
  // myNum ** 3
  if (!ts.isBinaryExpression(node)) return;

  if (node.operatorToken.kind === SyntaxKind.AsteriskAsteriskToken) {
    return context.factory.createCallExpression(
      context.factory.createPropertyAccessExpression(
        context.factory.createIdentifier('Math'),
        context.factory.createIdentifier('pow'),
      ),
      undefined,
      [node.left, node.right],
    );
  }

  if (node.operatorToken.kind === SyntaxKind.AsteriskAsteriskEqualsToken) {
    return context.factory.createBinaryExpression(
      node.left,
      context.factory.createToken(SyntaxKind.EqualsToken),
      context.factory.createCallExpression(
        context.factory.createPropertyAccessExpression(
          context.factory.createIdentifier('Math'),
          context.factory.createIdentifier('pow'),
        ),
        undefined,
        [node.left, node.right],
      ),
    );
  }
};

export const transformTemplateExpression: TransformerFn = function (
  this: Transpiler,
  node,
  context,
) {
  // `foo ${bar} baz` ==> "foo " + bar + " baz"
  if (!this.flags.transformTemplateExpression || !ts.isTemplateExpression(node))
    return;

  const head = context.factory.createNoSubstitutionTemplateLiteral(
    node.head.text,
  );

  return node.templateSpans.reduce((acc: ts.Expression, templateSpan) => {
    const expressionPlusLiteral = context.factory.createAdd(
      templateSpan.expression,
      context.factory.createNoSubstitutionTemplateLiteral(
        templateSpan.literal.text,
      ),
    );
    return context.factory.createAdd(acc, expressionPlusLiteral);
  }, head);
};
