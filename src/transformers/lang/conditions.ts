import ts, { SyntaxKind } from 'typescript';
import {
  type VisitNodeContext,
  type Transpiler,
  type EmitFn,
} from '../Transpiler';

export const transformNotOperator: EmitFn = function (
  this: Transpiler,
  node,
  context,
) {
  // !myVar
  if (this.utils.isBooleanNotExpression(node)) {
    return `!${this.utils.toExplicitBooleanCondition(node.operand, context)}`;
  }
};

export const transformConditions: EmitFn = function (
  this: Transpiler,
  node,
  context,
) {
  if (
    !(
      //  myVar ? a : b
      (
        this.utils.isOperandOfConditionalExpression(node) ||
        // myVar || hisVar > 0
        this.utils.isOperandOfBooleanExpression(node) ||
        // if (myVar) ; while(myVar) ;
        this.utils.isBooleanExpressionOfStatement(node)
      )
    )
  )
    return;

  if (this.utils.isBooleanExpressionOfVariableDeclaration(node.parent)) return;

  return this.utils.toExplicitBooleanCondition(node, context);
};

export const transformBooleanOperatorInVariableDeclaration: EmitFn = function (
  this: Transpiler,
  node,
  context,
) {
  if (!this.utils.isBooleanExpressionOfVariableDeclaration(node)) return;

  const operator =
    node.operatorToken.kind === SyntaxKind.AmpersandAmpersandToken
      ? 'and'
      : 'or';

  return `${this.utils.visitParenthesized(
    node.left,
    context,
  )}.${operator}(${this.emitNode(node.right, context)})`;
};

export const transformSwitchCase: EmitFn = function (
  this: Transpiler,
  node,
  context,
) {
  if (!ts.isSwitchStatement(node)) return;

  const expression = this.emitNode(node.expression, context);

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
        .map((st) => this.emitNode(st, context))
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
  this: Transpiler,
  node: ts.Node,
  context: VisitNodeContext,
): string {
  if (ts.isLiteralExpression(node)) return this.emitNode(node, context);

  return `_ == ${this.emitNode(node, context)} => true`;
};
