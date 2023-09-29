import ts, { SyntaxKind } from 'typescript';
import { logger } from '../../Logger';
import { type Transpiler, type EmitFn } from '../Transpiler';

export const transformObjectLiteralExpression: EmitFn = function (
  this: Transpiler,
  node,
  context,
) {
  if (!ts.isObjectLiteralExpression(node)) return;
  if (!node.properties.some((prop) => ts.isSpreadAssignment(prop))) return;

  let result = ``;
  let isPrevSpread = false;
  let isParenOpened = false;

  const closeParen = (): void => {
    if (!isParenOpened) return;
    result += `)`;
    isParenOpened = false;
  };

  node.properties.forEach((prop, index) => {
    if (index === 0) {
      result += ts.isSpreadAssignment(prop)
        ? this.emitNode(prop.expression, context)
        : `{${this.emitNode(prop, context)}`;
      isPrevSpread = ts.isSpreadAssignment(prop);
      return;
    }

    if (ts.isSpreadAssignment(prop)) {
      if (!isPrevSpread) result += `}`;
      closeParen();
      result += `.combine(${this.emitNode(prop.expression, context)})`;
      isPrevSpread = true;
      return;
    }

    if (isPrevSpread) {
      result += `.combine({`;
      isParenOpened = true;
    } else {
      result += `,`;
    }
    result += this.emitNode(prop, context);

    if (index === node.properties.length - 1) {
      result += `}`;
      closeParen();
    }

    isPrevSpread = false;
  });

  return result;
};

export const transformPropertyAssignment: EmitFn = function (
  this: Transpiler,
  node,
  context,
) {
  if (!ts.isPropertyAssignment(node)) return;
  if (!ts.isObjectLiteralExpression(node.parent)) return;
  // { 10: "bar" }
  if (ts.isNumericLiteral(node.name)) {
    return this.utils.replaceChild(
      node,
      context,
      node.name,
      `"${node.name.text}"`,
    );
  }
  // { [myVar]: "bar" }
  if (ts.isComputedPropertyName(node.name)) {
    logger.warn(
      `Computed property name is not supported at`,
      this.utils.getNodeSourcePath(node.name),
    );

    this.utils.ignoreNextNodeOfKind(node, SyntaxKind.CommaToken);
    return this.utils.commentOutNode(node);
  }
};

export const transformShorthandPropertyAssignment: EmitFn = function (
  this: Transpiler,
  node,
  context,
) {
  if (!ts.isShorthandPropertyAssignment(node)) return;
  if (!ts.isObjectLiteralExpression(node.parent)) return;
  // { myVar }
  return `${node.name.text}:${this.emitNode(node.name, context)}`;
};

export const transformElementAccess: EmitFn = function (
  this: Transpiler,
  node,
  context,
) {
  // myObj[myKey]
  if (!ts.isElementAccessExpression(node)) return;
  const type = this.typeChecker.getTypeAtLocation(node.expression);

  if (this.typeChecker.isArrayLikeType(type)) {
    if (!node.questionDotToken) return;
    const expression = this.emitNode(node.expression, context);
    const arg = this.emitNode(node.argumentExpression, context);
    return `(${expression} != null ? ${expression}[${arg}] : null)`;
  }

  if (type.flags & ts.TypeFlags.Object) {
    return `Reflect.field(${this.emitNode(
      node.expression,
      context,
    )}, ${this.emitNode(node.argumentExpression, context)})`;
  }
};

export const transformElementWriteToObject: EmitFn = function (
  this: Transpiler,
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
    return `Reflect.setField(${this.emitNode(
      expression,
      context,
    )}, ${this.emitNode(argumentExpression, context)}, ${this.emitNode(
      node.right,
      context,
    )})`;
  }
};

export const transformGetSet: EmitFn = function (this: Transpiler, node) {
  // { get prop() {}, set prop(value) {} }
  if (!(ts.isGetAccessor(node) || ts.isSetAccessor(node))) return;
  if (!ts.isObjectLiteralExpression(node.parent)) return;

  this.utils.ignoreNextNodeOfKind(node, SyntaxKind.CommaToken);
  return this.utils.commentOutNode(
    node,
    `Getters and setters on object literals are not supported at`,
  );
};
