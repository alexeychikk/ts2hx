import ts, { SyntaxKind } from 'typescript';
import { type VisitNodeContext, type Transformer } from '../Transformer';

export function isOperandOfConditionalExpression(
  this: Transformer,
  node: ts.Node,
): boolean {
  return (
    !!node.parent &&
    ts.isConditionalExpression(node.parent) &&
    node.parent.condition === node
  );
}

export function isOperandOfBooleanExpression(
  this: Transformer,
  node: ts.Node,
): boolean {
  return (
    !!node.parent &&
    ts.isBinaryExpression(node.parent) &&
    (node.parent.left === node || node.parent.right === node) &&
    [SyntaxKind.AmpersandAmpersandToken, SyntaxKind.BarBarToken].includes(
      node.parent.operatorToken.kind,
    )
  );
}

export function isBooleanExpressionOfStatement(
  this: Transformer,
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

export function toExplicitBooleanCondition(
  this: Transformer,
  node: ts.Node,
): string | undefined {
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
  if (ts.isArrayLiteralExpression(node) || ts.isObjectLiteralExpression(node)) {
    return 'true';
  }

  if (!ts.isIdentifier(node)) return;

  if (node.text === 'undefined' || node.text === 'NaN') {
    return 'false';
  }

  const type = this.typeChecker.getTypeAtLocation(node);
  if (
    ts.TypeFlags.Boolean & type.flags ||
    ts.TypeFlags.BooleanLiteral & type.flags
  ) {
    return node.getText();
  }
  if (ts.TypeFlags.Number & type.flags) {
    return `${node.getText()} != 0`;
  }
  if (ts.TypeFlags.String & type.flags) {
    return `${node.getText()} != ""`;
  }
  return `${node.getText()} != null`;
}

export function toSeparateStatements(
  this: Transformer,
  node: ts.Node,
  context: VisitNodeContext,
): string {
  if (
    !(
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === SyntaxKind.CommaToken
    )
  ) {
    return this.visitNode(node, context);
  }
  return `${this.utils.getIndent(node)}${this.visitNode(
    node.left,
    context,
  )};\n${this.utils.getIndent(node)}${this.visitNode(node.right, context)};\n`;
}
