import ts, { SyntaxKind } from 'typescript';
import {
  type VisitNodeContext,
  type Transformer,
  type TransformerFn,
} from '../Transformer';

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

export const transformSwitchCase: TransformerFn = function (
  this: Transformer,
  node,
  context,
) {
  if (!ts.isSwitchStatement(node)) return;

  const expression = this.visitNode(node.expression, context);

  let fallthroughCases: ts.CaseClause[] = [];
  const cases = node.caseBlock.clauses
    .map((clause) => {
      if (!clause.statements.length) {
        fallthroughCases.push(clause as ts.CaseClause);
        return;
      }

      const isBlock =
        clause.statements.length === 1 && ts.isBlock(clause.statements[0]);
      const statementNodes = isBlock
        ? (clause.statements[0] as ts.Block).statements
        : clause.statements;

      let statements = statementNodes
        .filter((st) => !ts.isBreakStatement(st))
        .map((st) => this.visitNode(st, context))
        .join('');
      if (isBlock) {
        statements = ` {${statements}\n${this.utils.getIndent(node)}  }`;
      }

      if (ts.isDefaultClause(clause)) {
        return `${this.utils.getIndent(node)}  default:${statements}`;
      }

      const fallthroughExpression = fallthroughCases
        .map(
          (el) =>
            `${transformCaseExpression.call(this, el.expression, context)}, `,
        )
        .join('');
      const expression = transformCaseExpression.call(
        this,
        clause.expression,
        context,
      );
      fallthroughCases = [];

      return `${this.utils.getIndent(
        node,
      )}  case ${fallthroughExpression}${expression}:${statements}`;
    })
    .filter(Boolean)
    .join('\n');

  return (
    `switch (${expression}) {\n${cases}` + `\n${this.utils.getIndent(node)}}`
  );
};

const transformCaseExpression = function (
  this: Transformer,
  node: ts.Node,
  context: VisitNodeContext,
): string {
  if (ts.isLiteralExpression(node)) return this.visitNode(node, context);

  return `_ == ${this.visitNode(node, context)} => true`;
};
