import ts, { SyntaxKind } from 'typescript';
import { type VisitNodeContext, type Transpiler } from '../Transpiler';

export function isBooleanNotExpression(
  node: ts.Node,
): node is ts.PrefixUnaryExpression {
  return (
    ts.isPrefixUnaryExpression(node) &&
    node.operator === SyntaxKind.ExclamationToken
  );
}

export function isBooleanBinaryExpression(
  node: ts.Node,
): node is ts.BinaryExpression {
  return (
    ts.isBinaryExpression(node) &&
    [SyntaxKind.AmpersandAmpersandToken, SyntaxKind.BarBarToken].includes(
      node.operatorToken.kind,
    )
  );
}

export function isBooleanAndExpression(
  node: ts.Node,
): node is ts.BinaryExpression {
  return (
    ts.isBinaryExpression(node) &&
    node.operatorToken.kind === SyntaxKind.AmpersandAmpersandToken
  );
}

export function isBooleanOrExpression(
  node: ts.Node,
): node is ts.BinaryExpression {
  return (
    ts.isBinaryExpression(node) &&
    node.operatorToken.kind === SyntaxKind.BarBarToken
  );
}

export function isBooleanExpression(node: ts.Node): node is ts.Expression {
  return isBooleanNotExpression(node) || isBooleanBinaryExpression(node);
}

export function isOperandOfConditionalExpression(
  this: Transpiler,
  node: ts.Node,
): boolean {
  return (
    !!node.parent &&
    ts.isConditionalExpression(node.parent) &&
    node.parent.condition === node
  );
}

export function isOperandOfBooleanExpression(
  this: Transpiler,
  node: ts.Node,
): boolean {
  return (
    !!node.parent &&
    this.utils.isBooleanBinaryExpression(node.parent) &&
    (node.parent.left === node || node.parent.right === node)
  );
}

export function isBooleanExpressionOfStatement(
  this: Transpiler,
  node: ts.Node,
): boolean {
  return (
    !!node.parent &&
    (ts.isIfStatement(node.parent) ||
      ts.isWhileStatement(node.parent) ||
      ts.isDoStatement(node.parent)) &&
    node.parent.expression === node
  );
}

export function isBooleanExpressionOfVariableDeclaration(
  node: ts.Node,
): node is ts.BinaryExpression {
  if (!isBooleanBinaryExpression(node)) return false;

  let parent = node.parent;
  while (!ts.isVariableDeclaration(parent)) {
    if (
      !(
        isBooleanBinaryExpression(parent) ||
        ts.isParenthesizedExpression(parent)
      )
    ) {
      return false;
    }
    parent = parent.parent;
  }

  return true;
}

export function toExplicitBooleanCondition(
  this: Transpiler,
  node: ts.Node,
  context: VisitNodeContext,
): string {
  switch (node.kind) {
    case SyntaxKind.TrueKeyword:
    case SyntaxKind.FalseKeyword:
      return node.getText();
    case SyntaxKind.NullKeyword:
      return 'false';
  }

  if (ts.isNumericLiteral(node)) {
    return node.text === '0' ? 'false' : 'true';
  }
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return node.text === '' ? 'false' : 'true';
  }
  if (
    ts.isArrayLiteralExpression(node) ||
    ts.isObjectLiteralExpression(node) ||
    ts.isFunctionLike(node)
  ) {
    return 'true';
  }

  if (
    ts.isIdentifier(node) &&
    (node.text === 'undefined' || node.text === 'NaN')
  ) {
    return 'false';
  }

  if (ts.isParenthesizedExpression(node)) {
    return `(${this.utils.toExplicitBooleanCondition(
      node.expression,
      context,
    )})`;
  }
  if (isBooleanBinaryExpression(node)) {
    return this.traverseChildren(node, context);
  }
  if (isBooleanNotExpression(node)) {
    return this.emitNode(node, context);
  }

  let result = this.traverseChildren(node, context);

  const type = this.typeChecker.getTypeAtLocation(node);
  if (
    ts.TypeFlags.Boolean & type.flags ||
    ts.TypeFlags.BooleanLiteral & type.flags
  ) {
    return result;
  }

  if (
    ts.TypeFlags.Number & type.flags ||
    ts.TypeFlags.NumberLiteral & type.flags
  ) {
    result = `${result} != 0`;
  } else if (
    ts.TypeFlags.String & type.flags ||
    ts.TypeFlags.StringLiteral & type.flags
  ) {
    result = `${result} != ""`;
  } else {
    result = `${result} != null`;
  }

  return this.utils.parenthesizeCode(node, result);
}

export function toSeparateStatements(
  this: Transpiler,
  node: ts.Node,
  context: VisitNodeContext,
): string {
  if (
    !(
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === SyntaxKind.CommaToken
    )
  ) {
    return this.emitNode(node, context);
  }
  return `${this.utils.getIndent(node)}${this.emitNode(
    node.left,
    context,
  )};\n${this.utils.getIndent(node)}${this.emitNode(node.right, context)};\n`;
}

export function isSuperExpression(this: Transpiler, node: ts.Node): boolean {
  return (
    ts.isExpressionStatement(node) &&
    ts.isCallExpression(node.expression) &&
    node.expression.expression.kind === SyntaxKind.SuperKeyword
  );
}
