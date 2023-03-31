import ts from "typescript";
import { TsUtils } from "../../TsUtils";
import { Transformer, TransformerFn } from "../Transformer";

export const transformVariableDeclarationList: TransformerFn = function (
	this: Transformer,
	node,
	context
) {
	// let foo: string, bar = 4
	if (!ts.isVariableDeclarationList(node)) return;
	const keyword = node.flags & ts.NodeFlags.Const ? "final" : "var";
	return node.declarations
		.map(
			(dec, i) =>
				`${i > 0 ? TsUtils.getIndent(dec) : ""}${keyword} ${this.visitNode(
					dec,
					context
				).trimStart()}`
		)
		.join(";\n");
};

export const transformVariableDeclaration: TransformerFn = function (
	this: Transformer,
	node,
	context
) {
	// foo: number = 5
	if (!ts.isVariableDeclaration(node)) return;
	return `${node.name.getText()}${
		node.type ? `: ${this.visitNode(node.type, context)}` : ""
	}${
		node.initializer ? ` = ${this.visitNode(node.initializer, context)}` : ""
	}`;
};
