import ts from 'typescript';
import fs from 'fs-extra';
import path from 'path';
import { Transformer, api, lang, type TransformerFn } from './transformers';
import { logger } from './Logger';

export interface ConverterOptions {
  tsconfigPath: string;
  outputDirPath: string;
  rootPackageName?: string;
}

// Order here actually matters
const transformers: TransformerFn[] = [
  api.transformJsApiAccess,
  api.transformTsLibTypes,
  lang.transformVariableDeclarationList,
  lang.transformVariableDeclaration,
  lang.transformForLoop,
  lang.transformForOfLoop,
  lang.transformForInLoop,
  lang.transformPropertySignature,
  lang.transformMethodSignature,
  lang.transformPropertyAssignment,
  lang.transformElementAccessOfObject,
  lang.transformElementWriteToObject,
  lang.transformGetSet,
  lang.transformMethodOnObject,
  lang.transformSimpleTemplate,
  lang.transformTemplateExpression,
  lang.transformTemplateParts,
  lang.transformLiteralTypes,
  lang.transformArrayType,
  lang.transformUnionType,
  lang.transformTupleType,
  lang.transformVoidExpression,
  lang.transformAsExpression,
  lang.transformRegex,
  lang.transformNotOperator,
  lang.transformConditions,
  lang.transformArrowFnToken,
  lang.transformKeywords,
];

export class Converter {
  program: ts.Program;
  typeChecker: ts.TypeChecker;
  compilerOptions: ts.CompilerOptions;
  outputDirPath: string;

  constructor(options: ConverterOptions) {
    const configFile = ts.readConfigFile(options.tsconfigPath, ts.sys.readFile);

    if (configFile.error != null) {
      logger.error(configFile.error.messageText);
      process.exit(1);
    }

    const config = ts.parseJsonConfigFileContent(
      configFile.config,
      ts.sys,
      path.dirname(options.tsconfigPath),
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
      throw new Error('rootDir must be set in your tsconfig.json');
    }
  }

  async run(): Promise<void> {
    await Promise.all(
      this.program.getSourceFiles().map(this.convertSourceFile),
    );
  }

  protected convertSourceFile = async (
    sourceFile: ts.SourceFile,
  ): Promise<void> => {
    if (sourceFile.isDeclarationFile) return;

    const transformer = new Transformer({
      sourceFile,
      transformers,
      typeChecker: this.typeChecker,
    });
    const haxeCode = transformer.run();

    await this.writeOutputFile(sourceFile.fileName, haxeCode);
  };

  protected async writeOutputFile(
    fileName: string,
    code: string,
  ): Promise<void> {
    const relativePath = path.relative(this.compilerOptions.rootDir!, fileName);
    const haxeFileName = path.join(
      this.outputDirPath,
      relativePath.replace(/\.ts$/i, '.hx'),
    );
    await fs.outputFile(haxeFileName, code);
  }
}
