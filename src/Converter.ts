import ts from "typescript";
import fs from "fs-extra";
import path from "path";
import { Transformer, TransformerFn } from "./transformers";
import * as fn from "./transformers/fn";
import { logger } from "./Logger";

export type ConverterOptions = {
	tsconfigPath: string;
	outputDirPath: string;
	rootPackageName?: string;
};

const transformers: TransformerFn[] = [
	fn.transformVariableDeclarationList,
	fn.transformVariableDeclaration,
	fn.transformArrowFnToken,
	fn.transformSimpleTemplate,
	fn.transformTemplateExpression,
	fn.transformTemplateParts,
	fn.transformPropertyAssignment,
	fn.transformElementAccessOfObject,
	fn.transformElementWriteToObject,
	fn.transformGetSet,
	fn.transformMethodOnObject,
	fn.transformLiteralTypes,
	fn.transformArrayType,
	fn.transformUnionType,
	fn.transformTupleType,
	fn.transformAsExpression,
	fn.transformRegex,
	fn.transformNotOperator,
	fn.transformConditions,
	fn.transformForLoop,
	fn.transformForOfLoop,
	fn.transformForInLoop,
	fn.transformJsApiAccess,
	fn.transformCommonTypes,
	fn.transformKeywords,
];

export class Converter {
	program: ts.Program;
	typeChecker: ts.TypeChecker;
	compilerOptions: ts.CompilerOptions;
	outputDirPath: string;

	constructor(options: ConverterOptions) {
		const configFile = ts.readConfigFile(options.tsconfigPath, ts.sys.readFile);

		if (configFile.error) {
			logger.error(configFile.error.messageText);
			process.exit(1);
		}

		const config = ts.parseJsonConfigFileContent(
			configFile.config,
			ts.sys,
			path.dirname(options.tsconfigPath)
		);

		const program = ts.createProgram({
			rootNames: config.fileNames,
			options: config.options,
		});

		this.program = program;
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

		const transformer = new Transformer({
			sourceFile,
			transformers,
			typeChecker: this.typeChecker,
		});
		const haxeCode = transformer.run();

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
}
