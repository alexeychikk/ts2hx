import ts, { SyntaxKind } from "typescript";
import { TsUtils } from "../../TsUtils";
import { Transformer, TransformerFn } from "../Transformer";

export const transformNotOperator: TransformerFn = function (
	this: Transformer,
	node,
	context
) {
	// !myVar
	if (
		ts.isPrefixUnaryExpression(node) &&
		node.operator === SyntaxKind.ExclamationToken
	) {
		const res = this.toExplicitBooleanCondition(node.operand, context);
		return res ? `!(${res})` : undefined;
	}
};

export const transformConditions: TransformerFn = function (
	this: Transformer,
	node,
	context
) {
	if (
		// myVar ? a : b
		TsUtils.isOperandOfConditionalExpression(node) ||
		// myVar || hisVar > 0
		TsUtils.isOperandOfBooleanExpression(node) ||
		// if (myVar) ; while(myVar) ;
		TsUtils.isBooleanExpressionOfStatement(node)
	) {
		return this.toExplicitBooleanCondition(node, context);
	}
};
