import ts, { SyntaxKind } from 'typescript';
import { logger } from '../../Logger';
import { TsUtils } from '../../TsUtils';
import { type Transformer, type TransformerFn } from '../Transformer';

export const transformPropertyAssignment: TransformerFn = function (
  this: Transformer,
  node,
  context,
) {
  if (!ts.isPropertyAssignment(node)) return;
  if (!ts.isObjectLiteralExpression(node.parent)) return;
  // { 10: "bar" }
  if (ts.isNumericLiteral(node.name)) {
    return this.replaceChild(node, context, node.name, `"${node.name.text}"`);
  }
  // { [myVar]: "bar" }
  if (ts.isComputedPropertyName(node.name)) {
    logger.warn(
      `Computed property name is not supported at`,
      TsUtils.getNodeSourcePath(node.name),
    );

    this.ignoreNextNodeOfKind(node, SyntaxKind.CommaToken);
    return TsUtils.commentOutNode(node);
  }
};

export const transformElementAccessOfObject: TransformerFn = function (
  this: Transformer,
  node,
  context,
) {
  // myObj[myKey]
  if (!ts.isElementAccessExpression(node)) return;
  const type = this.typeChecker.getTypeAtLocation(node.expression);
  if (this.typeChecker.isArrayLikeType(type)) return;
  if (type.flags & ts.TypeFlags.Object) {
    return `Reflect.field(${this.visitNode(
      node.expression,
      context,
    )}, ${this.visitNode(node.argumentExpression, context)})`;
  }
};

export const transformElementWriteToObject: TransformerFn = function (
  this: Transformer,
  node,
  context,
) {
  // myObj[myKey] = myValue
  if (!ts.isBinaryExpression(node)) return;
  if (node.operatorToken.kind !== SyntaxKind.EqualsToken) return;
  if (!ts.isElementAccessExpression(node.left)) return;

  const { expression, argumentExpression } = node.left;
  const type = this.typeChecker.getTypeAtLocation(expression);
  if (this.typeChecker.isArrayLikeType(type)) return;

  if (type.flags & ts.TypeFlags.Object) {
    return `Reflect.setField(${this.visitNode(
      expression,
      context,
    )}, ${this.visitNode(argumentExpression, context)}, ${this.visitNode(
      node.right,
      context,
    )})`;
  }
};

export const transformGetSet: TransformerFn = function (
  this: Transformer,
  node,
) {
  // { get prop() {}, set prop(value) {} }
  if (!(ts.isGetAccessor(node) || ts.isSetAccessor(node))) return;
  if (!ts.isObjectLiteralExpression(node.parent)) return;
  logger.warn(
    `Getters and setters on object literals are not supported at`,
    TsUtils.getNodeSourcePath(node),
  );

  this.ignoreNextNodeOfKind(node, SyntaxKind.CommaToken);
  return TsUtils.commentOutNode(node);
};

export const transformMethodOnObject: TransformerFn = function (
  this: Transformer,
  node,
  context,
) {
  // { methodOnObject() {} }
  if (!ts.isMethodDeclaration(node)) return;
  if (!ts.isObjectLiteralExpression(node.parent)) return;
  return this.replaceChild(
    node,
    context,
    node.name,
    `${node.name.getText()}: function`,
  );
};