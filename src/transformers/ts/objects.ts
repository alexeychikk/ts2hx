import ts from 'typescript';
import { type TransformerFn, type Transpiler } from '../Transpiler';

export const transformMethodOnObject: TransformerFn = function (
  this: Transpiler,
  node,
  context,
) {
  // { methodOnObject() {} }
  if (!ts.isMethodDeclaration(node)) return;
  if (!ts.isObjectLiteralExpression(node.parent)) return;

  return context.factory.createPropertyAssignment(
    this.visitNode(node.name),
    context.factory.createFunctionExpression(
      ts.getModifiers(node),
      this.visitNode(node.asteriskToken),
      undefined,
      this.visitNodes(node.typeParameters),
      this.visitNodes(node.parameters),
      this.visitNode(node.type),
      node.body ? this.visitNode(node.body) : context.factory.createBlock([]),
    ),
  );
};
