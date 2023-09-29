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
      [this.visitNode(node.left), this.visitNode(node.right)],
    );
  }

  if (node.operatorToken.kind === SyntaxKind.AsteriskAsteriskEqualsToken) {
    const left = this.visitNode(node.left);
    return context.factory.createBinaryExpression(
      left,
      context.factory.createToken(SyntaxKind.EqualsToken),
      context.factory.createCallExpression(
        context.factory.createPropertyAccessExpression(
          context.factory.createIdentifier('Math'),
          context.factory.createIdentifier('pow'),
        ),
        undefined,
        [left, this.visitNode(node.right)],
      ),
    );
  }
};
