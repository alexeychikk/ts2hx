import ts from 'typescript';
import { type TransformerFn, type Transpiler } from '../Transpiler';

export const transformAsyncArrowFunction: TransformerFn = function (
  this: Transpiler,
  node: ts.Node,
  context: ts.TransformationContext,
) {
  if (!this.flags.transformAsyncAwait || !ts.isArrowFunction(node)) return;

  if (!node.modifiers?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword))
    return;

  // For single expression arrow functions, transform directly to Promise.resolve
  if (!ts.isBlock(node.body)) {
    const expression = ts.isAwaitExpression(node.body)
      ? node.body.expression
      : context.factory.createCallExpression(
          context.factory.createPropertyAccessExpression(
            context.factory.createIdentifier('Promise'),
            context.factory.createIdentifier('resolve'),
          ),
          undefined,
          [node.body],
        );

    // Return the arrow function without the async keyword
    return context.factory.updateArrowFunction(
      node,
      node.modifiers?.filter((m) => m.kind !== ts.SyntaxKind.AsyncKeyword),
      node.typeParameters,
      node.parameters,
      node.type,
      node.equalsGreaterThanToken,
      expression,
    );
  }

  // For block bodies, transform the statements
  const transformedBody = context.factory.updateBlock(
    node.body,
    node.body.statements.map(
      (statement) =>
        updateReturnStatements.call(
          this,
          statement,
          context,
        ) as ts.Statement,
    ),
  );

  // Return the arrow function without the async keyword
  return context.factory.updateArrowFunction(
    node,
    node.modifiers?.filter((m) => m.kind !== ts.SyntaxKind.AsyncKeyword),
    node.typeParameters,
    node.parameters,
    node.type,
    node.equalsGreaterThanToken,
    transformedBody,
  );
};

function updateReturnStatements(
  this: Transpiler,
  node: ts.Node,
  context: ts.TransformationContext,
): ts.Node {
  if (ts.isFunctionLike(node)) return node;

  let result: ts.Node = node;

  if (ts.isAwaitExpression(node)) {
    result = node.expression;
  } else if (
    ts.isReturnStatement(node) &&
    (!node.expression || !this.utils.isCallOf(node.expression, 'Promise.*'))
  ) {
    if (
      node.expression &&
      ts.isAwaitExpression(node.expression) &&
      ts.isCallExpression(node.expression.expression) &&
      this.utils.returnsPromise(node.expression.expression)
    ) {
      result = ts.visitEachChild(
        context.factory.createReturnStatement(node.expression.expression),
        (childNode) => updateReturnStatements.call(this, childNode, context),
        context,
      );
    } else {
      result = context.factory.createReturnStatement(
        context.factory.createCallExpression(
          context.factory.createPropertyAccessExpression(
            context.factory.createIdentifier('Promise'),
            context.factory.createIdentifier('resolve'),
          ),
          undefined,
          node.expression
            ? [
                ts.isAwaitExpression(node.expression)
                  ? node.expression.expression
                  : node.expression,
              ]
            : [],
        ),
      );
    }
  }

  return ts.visitEachChild(
    result,
    (childNode) => updateReturnStatements.call(this, childNode, context),
    context,
  );
}
