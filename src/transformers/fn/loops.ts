import ts from "typescript";
import { TsUtils } from "../../TsUtils";
import { Transformer, TransformerFn } from "../Transformer";

export const transformForLoop: TransformerFn = function (
	this: Transformer,
	node,
	context
) {
	// for (;;)
	if (!ts.isForStatement(node)) return;
	return (
		(node.initializer
			? `${this.visitNode(node.initializer, context)};\n`
			: "") +
		`${node.initializer ? TsUtils.getIndent(node) : ""}while(${
			node.condition
				? this.toExplicitBooleanCondition(node.condition, context)
				: "true"
		}) {` +
		(ts.isBlock(node.statement)
			? node.statement.statements
					.map((s) => this.visitNode(s, context))
					.join("") + "\n"
			: this.visitNode(node.statement, context) + "\n") +
		(node.incrementor
			? `${this.toSeparateStatements(node.incrementor, context)}`
			: "") +
		`${TsUtils.getIndent(node)}}`
	);
};
