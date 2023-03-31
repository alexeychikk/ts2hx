import ts, { SyntaxKind } from "typescript";
import fs from "fs-extra";
import path from "path";
import { logger } from "./Logger";
import { TsUtils } from "./TsUtils";

export type ConverterOptions = {
	program: ts.Program;
	outputDirPath: string;
	rootPackageName?: string;
};

export class Converter {
	program: ts.Program;
	typeChecker: ts.TypeChecker;
	compilerOptions: ts.CompilerOptions;
	outputDirPath: string;
	fileContexts: Record<string, SourceFileContext> = {};

	constructor(options: ConverterOptions) {
		this.program = options.program;
		this.outputDirPath = options.outputDirPath;
		this.typeChecker = this.program.getTypeChecker();
		this.compilerOptions = this.program.getCompilerOptions();

		if (!this.compilerOptions.rootDir) {
			throw new Error("rootDir must be set in your tsconfig.json");
		}
	}

	async run() {
		await Promise.all(
			this.program.getSourceFiles().map(this.convertSourceFile)
		);
	}

	protected convertSourceFile = async (sourceFile: ts.SourceFile) => {
		if (sourceFile.isDeclarationFile) return;

		const context: VisitNodeContext = {
			indentLevel: 0,
		};
		const fileContext: SourceFileContext = {
			nodesToIgnore: new Set(),
		};
		this.fileContexts[sourceFile.fileName] = fileContext;

		let haxeCode = this.visitNode(sourceFile, context);
		if (fileContext.includeEitherTypeImport)
			haxeCode = `import haxe.extern.EitherType;\n\n${haxeCode}`;

		await this.writeOutputFile(sourceFile.fileName, haxeCode);
	};

	protected async writeOutputFile(fileName: string, code: string) {
		const relativePath = path.relative(this.compilerOptions.rootDir!, fileName);
		const haxeFileName = path.join(
			this.outputDirPath,
			relativePath.replace(/\.ts$/i, ".hx")
		);
		await fs.outputFile(haxeFileName, code);
	}

	protected visitNode(
		node: ts.Node | undefined,
		context: VisitNodeContext
	): string {
		if (!node || this.getFileContext(node).nodesToIgnore.has(node)) {
			return "";
		}

		const transformedCode = this.transformNode(
			node,
			context,
			() => {
				// let foo: string, bar = 4
				if (!ts.isVariableDeclarationList(node)) return;
				const keyword = node.flags & ts.NodeFlags.Const ? "final" : "var";
				return node.declarations
					.map(
						(dec, i) =>
							`${
								i > 0 ? TsUtils.getIndent(dec) : ""
							}${keyword} ${this.visitNode(dec, context).trimStart()}`
					)
					.join(";\n");
			},
			() => {
				// foo: number = 5
				if (!ts.isVariableDeclaration(node)) return;
				return `${node.name.getText()}${
					node.type ? `: ${this.visitNode(node.type, context)}` : ""
				}${
					node.initializer
						? ` = ${this.visitNode(node.initializer, context)}`
						: ""
				}`;
			},
			() => {
				if (!ts.isEqualsGreaterThanToken(node)) return;
				return `->`;
			},
			() => {
				// `"Hello"`
				if (!ts.isNoSubstitutionTemplateLiteral(node)) return;
				return `"${TsUtils.escapeStringText(node.text)}"`;
			},
			() => {
				// `foo ${varX} bar ${varY ? `inner ${varZ} end` : ""} baz`
				if (!ts.isTemplateExpression(node)) return;
				return `'${TsUtils.escapeTemplateText(
					node.head.text
				)}${node.templateSpans
					.map((span) => `\${${this.visitNode(span, context)}`)
					.join("")}'`;
			},
			() => {
				if (!ts.isTemplateMiddleOrTemplateTail(node)) return;
				return `}${TsUtils.escapeTemplateText(node.text)}`;
			},
			() => {
				if (!ts.isPropertyAssignment(node)) return;
				if (!ts.isObjectLiteralExpression(node.parent)) return;
				// { 10: "bar" }
				if (ts.isNumericLiteral(node.name)) {
					return this.replaceChild(
						node,
						context,
						node.name,
						`"${node.name.text}"`
					);
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
			},
			() => {
				// { get prop() {}, set prop(value) {} }
				if (!(ts.isGetAccessor(node) || ts.isSetAccessor(node))) return;
				if (!ts.isObjectLiteralExpression(node.parent)) return;
				logger.warn(
					`Getters and setters on object literals are not supported at`,
					TsUtils.getNodeSourcePath(node)
				);

				this.ignoreNextNodeOfKind(node, SyntaxKind.CommaToken);
				return TsUtils.commentOutNode(node);
			},
			() => {
				// { methodOnObject() {} }
				if (!ts.isMethodDeclaration(node)) return;
				if (!ts.isObjectLiteralExpression(node.parent)) return;
				return this.replaceChild(
					node,
					context,
					node.name,
					`${node.name.getText()}: function`
				);
			},
			() => {
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
			},
			() => {
				// myVar: number[]
				if (!ts.isArrayTypeNode(node)) return;
				return `Array<${this.visitNode(node.elementType, context)}>`;
			},
			() => {
				// myVar: string | boolean
				if (!ts.isUnionTypeNode(node)) return;
				if (node.types.length > 3) return "Dynamic";
				return this.toEitherType(node, context, node.types);
			},
			() => {
				// myVar: [number, string]
				if (!ts.isTupleTypeNode(node)) return;
				if (node.elements.length > 3) return "Dynamic";
				const res = this.toEitherType(node, context, node.elements);
				return res ? `Array<${res}>` : undefined;
			},
			() => {
				// myVar = hisVar as T
				if (
					ts.isAsExpression(node) &&
					!ts.isParenthesizedExpression(node.parent)
				) {
					return `(${this.traverseChildren(node, context)})`;
				}
			},
			() => {
				// /[a-z]{0,9}/gim
				if (!ts.isRegularExpressionLiteral(node)) return;
				return `~${node.text}`;
			},
			() => {
				// !myVar
				if (
					ts.isPrefixUnaryExpression(node) &&
					node.operator === SyntaxKind.ExclamationToken
				) {
					const res = this.toExplicitBooleanCondition(node.operand, context);
					return res ? `!(${res})` : undefined;
				}
			},
			() => {
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
			},
			() => {
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
			},
			() => {
				if (!ts.isPropertyAccessExpression(node)) return;
				switch (node.getText()) {
					case "console.log":
						return "trace";
				}
			},
			() => {
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
			}
		);

		if (transformedCode) return this.dump(node, transformedCode);
		return this.traverseChildren(node, context);
	}

	protected transformNode(
		node: ts.Node,
		context: VisitNodeContext,
		...transformers: NodeTransformer[]
	): string | undefined | void {
		for (const transformer of transformers) {
			const result = transformer(node, context);
			if (result) return result;
		}
	}

	protected traverseChildren(node: ts.Node, context: VisitNodeContext): string {
		const nodeFullCode = node
			.getChildren()
			.map((node) => this.visitNode(node, context))
			.join("");

		return nodeFullCode || node.getFullText();
	}

	protected replaceChild(
		node: ts.Node,
		context: VisitNodeContext,
		childToReplace: ts.Node,
		code: string
	): string {
		const nodeFullCode = node
			.getChildren()
			.map((node) =>
				node === childToReplace ? code : this.visitNode(node, context)
			)
			.join("");

		return nodeFullCode || node.getFullText();
	}

	protected dump(node: ts.Node, code: string): string {
		return node.getFullText().replace(node.getText(), code);
	}

	protected toEitherType = (
		node: ts.Node,
		context: VisitNodeContext,
		types: ts.NodeArray<ts.TypeNode>
	): string | undefined => {
		const res =
			types
				.map(
					(t, i) =>
						`${i < types.length - 1 ? "EitherType<" : ""}${this.visitNode(
							t,
							context
						)}`
				)
				.join(", ") + ">".repeat(types.length - 1);
		if (res) {
			this.getFileContext(node).includeEitherTypeImport = true;
		}
		return res;
	};

	protected toExplicitBooleanCondition: NodeTransformer = (node) => {
		switch (node.kind) {
			case SyntaxKind.TrueKeyword:
			case SyntaxKind.FalseKeyword:
				return node.getText();
			case SyntaxKind.NullKeyword:
				return "false";
		}

		if (ts.isNumericLiteral(node)) {
			return node.text === "0" ? "false" : "true";
		}
		if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
			return node.text === "" ? "false" : "true";
		}
		if (
			ts.isArrayLiteralExpression(node) ||
			ts.isObjectLiteralExpression(node)
		) {
			return "true";
		}

		if (!ts.isIdentifier(node)) return;

		if (node.text === "undefined" || node.text === "NaN") {
			return "false";
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
	};

	protected toSeparateStatements(node: ts.Node, context: VisitNodeContext) {
		if (
			!(
				ts.isBinaryExpression(node) &&
				node.operatorToken.kind === SyntaxKind.CommaToken
			)
		) {
			return this.visitNode(node, context);
		}
		return `${TsUtils.getIndent(node)}${this.visitNode(
			node.left,
			context
		)};\n${TsUtils.getIndent(node)}${this.visitNode(node.right, context)};\n`;
	}

	protected ignoreNode(node: ts.Node) {
		this.getFileContext(node).nodesToIgnore.add(node);
	}

	protected ignoreNextNodeOfKind(node: ts.Node, kind: SyntaxKind) {
		const nextNode = TsUtils.getNextNode(node);
		if (nextNode?.kind === kind) {
			this.ignoreNode(nextNode);
		}
	}

	protected getFileContext(node: ts.Node) {
		return this.fileContexts[node.getSourceFile().fileName];
	}
}

/**
 * I intended to store indentation level here
 * but seems like this is redundant now
 */
type VisitNodeContext = {};

type SourceFileContext = {
	includeEitherTypeImport?: boolean;
	nodesToIgnore: Set<ts.Node>;
};

type NodeTransformer = (
	node: ts.Node,
	context: VisitNodeContext
) => string | undefined | void;
