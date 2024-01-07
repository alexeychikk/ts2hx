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

export const transformDeleteExpression: TransformerFn = function (
  this: Transpiler,
  node,
  context,
) {
  // delete foo.bar ==> Reflect.deleteField(foo, 'bar')
  // delete foo[bar] ==> Reflect.deleteField(foo, bar)
  if (!ts.isDeleteExpression(node)) return;

  const expression = node.expression as
    | ts.PropertyAccessExpression
    | ts.ElementAccessExpression;

  return context.factory.createCallExpression(
    context.factory.createPropertyAccessExpression(
      context.factory.createIdentifier('Reflect'),
      context.factory.createIdentifier('deleteField'),
    ),
    undefined,
    [
      expression.expression,
      ts.isPropertyAccessExpression(expression)
        ? context.factory.createStringLiteral(
            this.utils.toHaxeIdentifier(expression.name.text),
          )
        : expression.argumentExpression,
    ],
  );
};
