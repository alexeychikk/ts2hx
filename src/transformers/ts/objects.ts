import ts from 'typescript';
import { type TransformerFn, type Transpiler } from '../Transpiler';

export const transformMethodOnObject: TransformerFn = function (
  this: Transpiler,
  node,
  context,
  parentNode,
) {
  // { methodOnObject() {} }
  if (!ts.isMethodDeclaration(node)) return;
  if (!ts.isObjectLiteralExpression(parentNode)) return;

  return context.factory.createPropertyAssignment(
    node.name,
    context.factory.createFunctionExpression(
      ts.getModifiers(node),
      node.asteriskToken,
      undefined,
      node.typeParameters,
      node.parameters,
      node.type,
      node.body ? node.body : context.factory.createBlock([]),
    ),
  );
};
