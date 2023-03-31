import ts, { SyntaxKind } from "typescript";
import { TsUtils } from "../../TsUtils";
import { Transformer, TransformerFn } from "../Transformer";

export const transformKeywords: TransformerFn = function (
	this: Transformer,
	node
) {
	switch (node.kind) {
		// myVar: number
		case SyntaxKind.NumberKeyword:
			return "Float";
		// myVar: string
		case SyntaxKind.StringKeyword:
			return "String";
		// myVar: boolean
		case SyntaxKind.BooleanKeyword:
			return "Bool";
		// myVar: undefined
		case SyntaxKind.UndefinedKeyword:
			return "Null<Any>";
		// myVar: unknown
		case SyntaxKind.UnknownKeyword:
		// myVar: any
		case SyntaxKind.AnyKeyword:
			return "Any";
		// type T = ...
		case SyntaxKind.TypeKeyword:
			return "typedef";
		// (myVar as string)
		case SyntaxKind.AsKeyword:
			return ":";
		case SyntaxKind.ExportKeyword:
			return "@:export";
		case SyntaxKind.Identifier:
			switch (node.getText()) {
				// myVar = undefined
				case "undefined":
					return "null";
				// myVar = NaN
				case "NaN":
					return "Math.NaN";
			}
	}
};

export const transformSimpleTemplate: TransformerFn = function (
	this: Transformer,
	node
) {
	// `"Hello"`
	if (!ts.isNoSubstitutionTemplateLiteral(node)) return;
	return `"${TsUtils.escapeStringText(node.text)}"`;
};

export const transformTemplateExpression: TransformerFn = function (
	this: Transformer,
	node,
	context
) {
	// `foo ${varX} bar ${varY ? `inner ${varZ} end` : ""} baz`
	if (!ts.isTemplateExpression(node)) return;
	return `'${TsUtils.escapeTemplateText(node.head.text)}${node.templateSpans
		.map((span) => `\${${this.visitNode(span, context)}`)
		.join("")}'`;
};

export const transformTemplateParts: TransformerFn = function (
	this: Transformer,
	node
) {
	if (!ts.isTemplateMiddleOrTemplateTail(node)) return;
	return `}${TsUtils.escapeTemplateText(node.text)}`;
};

export const transformRegex: TransformerFn = function (
	this: Transformer,
	node
) {
	// /[a-z]{0,9}/gim
	if (!ts.isRegularExpressionLiteral(node)) return;
	return `~${node.text}`;
};

export const transformLiteralTypes: TransformerFn = function (
	this: Transformer,
	node
) {
	if (!ts.isLiteralTypeNode(node)) return;
	// myVar: 42
	if (ts.isNumericLiteral(node.literal)) {
		return "Float";
	}
	// myVar: "Hello"
	if (ts.isStringLiteral(node.literal)) {
		return "String";
	}
	// myVar: true
	if (
		node.literal.kind === SyntaxKind.TrueKeyword ||
		node.literal.kind === SyntaxKind.FalseKeyword
	) {
		return "Bool";
	}
	// myVar: null
	if (node.literal.kind === SyntaxKind.NullKeyword) {
		return "Null<Any>";
	}
};

export const transformArrayType: TransformerFn = function (
	this: Transformer,
	node,
	context
) {
	// myVar: number[]
	if (!ts.isArrayTypeNode(node)) return;
	return `Array<${this.visitNode(node.elementType, context)}>`;
};

export const transformUnionType: TransformerFn = function (
	this: Transformer,
	node,
	context
) {
	// myVar: string | boolean
	if (!ts.isUnionTypeNode(node)) return;
	if (node.types.length > 3) return "Dynamic";
	return this.toEitherType(node, context, node.types);
};

export const transformTupleType: TransformerFn = function (
	this: Transformer,
	node,
	context
) {
	// myVar: [number, string]
	if (!ts.isTupleTypeNode(node)) return;
	if (node.elements.length > 3) return "Dynamic";
	const res = this.toEitherType(node, context, node.elements);
	return res ? `Array<${res}>` : undefined;
};

export const transformAsExpression: TransformerFn = function (
	this: Transformer,
	node,
	context
) {
	// myVar = hisVar as T
	if (ts.isAsExpression(node) && !ts.isParenthesizedExpression(node.parent)) {
		return `(${this.traverseChildren(node, context)})`;
	}
};
