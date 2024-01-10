import ts from 'typescript';
import { type TransformerFn, type Transpiler } from '../Transpiler';

export const transformAsyncFunction: TransformerFn = function (
  this: Transpiler,
  node,
  context,
) {
  // async function foo() { return 1; } ==> function foo() { return Promise.resolve(1); }
  if (!this.flags.transformAsyncAwait || !ts.isFunctionDeclaration(node))
    return;

  if (!node.modifiers?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword))
    return;

  return context.factory.updateFunctionDeclaration(
    node,
    node.modifiers?.filter((m) => m.kind !== ts.SyntaxKind.AsyncKeyword),
    node.asteriskToken,
    node.name,
    node.typeParameters,
    node.parameters,
    node.type,
    node.body
      ? context.factory.updateBlock(
          node.body,
          node.body.statements.map(
            (statement) =>
              updateReturnStatements.call(
                this,
                statement,
                context,
              ) as ts.Statement,
          ),
        )
      : undefined,
  );
};

export const transformAsyncMethod: TransformerFn = function (
  this: Transpiler,
  node,
  context,
) {
  if (!this.flags.transformAsyncAwait || !ts.isMethodDeclaration(node)) return;

  if (!node.modifiers?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword))
    return;

  return context.factory.updateMethodDeclaration(
    node,
    node.modifiers?.filter((m) => m.kind !== ts.SyntaxKind.AsyncKeyword),
    node.asteriskToken,
    node.name,
    node.questionToken,
    node.typeParameters,
    node.parameters,
    node.type,
    node.body
      ? context.factory.updateBlock(
          node.body,
          node.body.statements.map(
            (statement) =>
              updateReturnStatements.call(
                this,
                statement,
                context,
              ) as ts.Statement,
          ),
        )
      : undefined,
  );
};

function updateReturnStatements(
  this: Transpiler,
  node: ts.Node,
  context: ts.TransformationContext,
): ts.Node {
  if (ts.isFunctionLike(node)) return node;

  let result: ts.Node = node;

  if (
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
