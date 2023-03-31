import ts, { SyntaxKind } from "typescript";
import { logger } from "../../Logger";
import { TsUtils } from "../../TsUtils";
import { Transformer, TransformerFn } from "../Transformer";

export const transformPropertyAssignment: TransformerFn = function (
	this: Transformer,
	node,
	context
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
			TsUtils.getNodeSourcePath(node.name)
		);

		this.ignoreNextNodeOfKind(node, SyntaxKind.CommaToken);
		return TsUtils.commentOutNode(node);
	}
};

export const transformGetSet: TransformerFn = function (
	this: Transformer,
	node
) {
	// { get prop() {}, set prop(value) {} }
	if (!(ts.isGetAccessor(node) || ts.isSetAccessor(node))) return;
	if (!ts.isObjectLiteralExpression(node.parent)) return;
	logger.warn(
		`Getters and setters on object literals are not supported at`,
		TsUtils.getNodeSourcePath(node)
	);

	this.ignoreNextNodeOfKind(node, SyntaxKind.CommaToken);
	return TsUtils.commentOutNode(node);
};

export const transformMethodOnObject: TransformerFn = function (
	this: Transformer,
	node,
	context
) {
	// { methodOnObject() {} }
	if (!ts.isMethodDeclaration(node)) return;
	if (!ts.isObjectLiteralExpression(node.parent)) return;
	return this.replaceChild(
		node,
		context,
		node.name,
		`${node.name.getText()}: function`
	);
};
