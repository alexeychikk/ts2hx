import ts from 'typescript';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { promisify } from 'util';
import { exec } from 'child_process';

import { Transformer, TRANSFORMERS } from './transformers';
import { logger } from './Logger';

const execAsync = promisify(exec);

export interface ConverterOptions {
  tsconfigPath: string;
  outputDirPath: string;
  flags?: ConverterFlags;
}

export interface ConverterFlags {
  clean?: boolean;
  copyFormatJson?: boolean;
  copyHaxeLibraries?: boolean;
  copyLibFiles?: boolean;
  createBuildHxml?: boolean;
  format?: boolean;
  ignoreFormatError?: boolean;
  ignoreErrors?: boolean;
  includeComments?: boolean;
  includeTodos?: boolean;
}

export class Converter {
  program: ts.Program;
  typeChecker: ts.TypeChecker;
  compilerOptions: ts.CompilerOptions;
  outputDirPath: string;
  flags: ConverterFlags;

  protected startTime: number;
  protected rootFolderNames = new Set<string>();

  constructor(options: ConverterOptions) {
    this.startTime = Date.now();
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
    this.flags = options.flags ?? {};

    if (!this.compilerOptions.rootDir) {
      throw new Error('rootDir must be set in your tsconfig.json');
    }
  }

  async run(): Promise<void> {
    if (this.flags.clean) {
      logger.log('Cleaning output dir');
      await fs.emptyDir(this.outputDirPath);
    }

    await Promise.all(
      this.program.getSourceFiles().map(this.convertSourceFile),
    );

    if (this.flags.copyLibFiles) {
      logger.log('Copying ts2hx lib files');
      await this.copyFromCwdToOutput('./lib/ts2hx', './ts2hx');
      await this.copyImportHxFiles();
    }

    if (this.flags.copyHaxeLibraries) {
      logger.log('Copying haxe libraries');
      await this.copyFromCwdToOutput('./haxe_libraries', './haxe_libraries');
      await this.copyFromCwdToOutput('./.haxerc', './.haxerc');
    }

    if (this.flags.copyFormatJson) {
      logger.log('Copying hxformat.json');
      await this.copyFromCwdToOutput('./hxformat.json', './hxformat.json');
    }

    if (this.flags.createBuildHxml) {
      logger.log('Creating build.hxml');
      await this.createBuildHxml();
    }

    if (this.flags.format) {
      logger.log('Formatting output');
      await this.formatOutput();
    }

    const doneInMs = Date.now() - this.startTime;
    logger.log(
      'Done in',
      doneInMs > 999 ? `${(doneInMs / 1000).toFixed(3)} s` : `${doneInMs} ms`,
    );
  }

  async formatOutput(): Promise<void> {
    try {
      const lixPath = path.resolve(
        process.cwd(),
        './node_modules/.bin/lix' + (os.platform() === 'win32' ? '.cmd' : ''),
      );
      await execAsync(`${lixPath} run formatter -s ${this.outputDirPath}`);
    } catch (error) {
      const errorMessage =
        'Failed to format output.\n' +
        'This usually happens when syntax of the resulting Haxe code is incorrect.';

      if (this.flags.ignoreFormatError) {
        logger.warn(errorMessage);
        return;
      }
      throw new Error(errorMessage);
    }
  }

  async createBuildHxml(): Promise<void> {
    const buildHxmlPath = path.join(this.outputDirPath, './build.hxml');
    await fs.outputFile(
      buildHxmlPath,
      `--class-path ts2hx
${Array.from(this.rootFolderNames)
  .map((name) => `--class-path ${name}`)
  .join('\n')}
--library tink_core
--library tink_await
`,
    );
  }

  async copyImportHxFiles(): Promise<void> {
    await Promise.all(
      Array.from(this.rootFolderNames).map(async (rootName) => {
        await this.copyFromCwdToOutput(
          './lib/import.hx',
          `./${rootName}/import.hx`,
        );
      }),
    );
  }

  protected async copyFromCwdToOutput(
    relativePath: string,
    outputPath?: string,
  ): Promise<void> {
    const absolutePath = path.resolve(process.cwd(), relativePath);
    const finalPath = outputPath
      ? path.join(this.outputDirPath, outputPath)
      : this.outputDirPath;
    await fs.copy(absolutePath, finalPath);
  }

  protected convertSourceFile = async (
    sourceFile: ts.SourceFile,
  ): Promise<void> => {
    if (sourceFile.isDeclarationFile) return;

    const relativePath = path.relative(
      this.compilerOptions.rootDir!,
      sourceFile.fileName,
    );
    const rootDir = relativePath.split(path.sep)[0];
    this.rootFolderNames.add(rootDir);

    const transformer = new Transformer({
      sourceFile,
      transformers: TRANSFORMERS,
      typeChecker: this.typeChecker,
      compilerOptions: this.compilerOptions,
      ignoreErrors: this.flags.ignoreErrors,
      includeComments: this.flags.includeComments,
      includeTodos: this.flags.includeTodos,
    });
    const haxeCode = transformer.run();
    if (!haxeCode) {
      logger.warn(`Transformed file is empty`, sourceFile.fileName);
      return;
    }

    await this.writeOutputFile(transformer.utils.getHaxeFilePath(), haxeCode);
  };

  protected async writeOutputFile(
    fileName: string,
    code: string,
  ): Promise<void> {
    const haxeFileName = path.join(this.outputDirPath, fileName);
    await fs.outputFile(haxeFileName, code);
  }
}
