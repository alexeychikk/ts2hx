import ts, { SyntaxKind } from 'typescript';
import { type Transformer, type TransformerFn } from '../Transformer';

export const transformNotOperator: TransformerFn = function (
  this: Transformer,
  node,
  context,
) {
  // !myVar
  if (
    ts.isPrefixUnaryExpression(node) &&
    node.operator === SyntaxKind.ExclamationToken
  ) {
    const res = this.utils.toExplicitBooleanCondition(node.operand);
    return res ? `!(${res})` : undefined;
  }
};

export const transformConditions: TransformerFn = function (
  this: Transformer,
  node,
  context,
) {
  if (
    // myVar ? a : b
    this.utils.isOperandOfConditionalExpression(node) ||
    // myVar || hisVar > 0
    this.utils.isOperandOfBooleanExpression(node) ||
    // if (myVar) ; while(myVar) ;
    this.utils.isBooleanExpressionOfStatement(node)
  ) {
    return this.utils.toExplicitBooleanCondition(node);
  }
};
