import ts from 'typescript';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { promisify } from 'util';
import { exec } from 'child_process';

import { Transpiler, EMITTERS, TRANSFORMERS } from './transformers';
import { logger } from './Logger';
import {
  type RawSourceFile,
  asyncPool,
  createInMemoryCompilerHost,
} from './utils';

const execAsync = promisify(exec);

export type ConverterOptions =
  | ConverterOptionsTsConfig
  | ConverterOptionsProgram;

export interface ConverterOptionsTsConfig {
  tsconfigPath: string;
  outputDirPath?: string;
  flags?: ConverterFlags;
}

export interface ConverterOptionsProgram {
  program: ts.Program;
  outputDirPath?: string;
  flags?: ConverterFlags;
}

export interface ConverterFlags {
  clean?: boolean;
  copyFormatJson?: boolean;
  copyHaxeLibraries?: boolean;
  copyLibFiles?: boolean;
  copyImportHx?: boolean;
  createBuildHxml?: boolean;
  format?: boolean;
  ignoreFormatError?: boolean;
  ignoreErrors?: boolean;
  includeComments?: boolean;
  includeTodos?: boolean;
}

export class Converter {
  program: ts.Program;
  outputDirPath?: string;
  flags: ConverterFlags;
  sourceFileTranspilers = new Map<string, Transpiler>();

  protected startTime: number;
  protected printer = ts.createPrinter({
    newLine: ts.NewLineKind.LineFeed,
  });

  constructor(options: ConverterOptions) {
    this.startTime = Date.now();
    this.program =
      'program' in options ? options.program : this.createProgram(options);
    this.outputDirPath = options.outputDirPath;
    // warm up
    this.program.getTypeChecker();
    const compilerOptions = this.program.getCompilerOptions();
    this.flags = options.flags ?? {};

    if (!compilerOptions.rootDir) {
      throw new Error('rootDir must be set in your tsconfig.json');
    }
  }

  async run(): Promise<void> {
    if (this.flags.clean && this.outputDirPath) {
      logger.log('Cleaning output dir');
      await fs.emptyDir(this.outputDirPath);
    }

    logger.log('Running TS transformers');
    await this.runTsTransformers();

    logger.log('Emitting Haxe code');
    await this.emitHaxeCode();

    if (this.flags.copyLibFiles && this.outputDirPath) {
      logger.log('Copying ts2hx lib files');
      await this.copyFromCwdToOutput('./lib/ts2hx', './ts2hx');
    }

    if (this.flags.copyImportHx && this.outputDirPath) {
      logger.log('Copying import.hx file into source roots');
      await this.copyFromCwdToOutput('./lib/import.hx', './src/import.hx');
    }

    if (this.flags.copyHaxeLibraries && this.outputDirPath) {
      logger.log('Copying haxe libraries');
      await this.copyFromCwdToOutput('./haxe_libraries', './haxe_libraries');
      await this.copyFromCwdToOutput('./.haxerc', './.haxerc');
    }

    if (this.flags.copyFormatJson && this.outputDirPath) {
      logger.log('Copying hxformat.json');
      await this.copyFromCwdToOutput('./hxformat.json', './hxformat.json');
    }

    if (this.flags.createBuildHxml && this.outputDirPath) {
      logger.log('Creating build.hxml');
      await this.createBuildHxml();
    }

    if (this.flags.format && this.outputDirPath) {
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
      if (!this.outputDirPath) return;
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
    if (!this.outputDirPath) return;
    const buildHxmlPath = path.join(this.outputDirPath, './build.hxml');
    await fs.outputFile(
      buildHxmlPath,
      `--class-path ts2hx
--class-path src
--library tink_core
--library tink_await
`,
    );
  }

  protected createProgram(options: ConverterOptionsTsConfig): ts.Program {
    const configFile = ts.readConfigFile(options.tsconfigPath, ts.sys.readFile);

    if (configFile.error != null) {
      throw new Error(
        typeof configFile.error.messageText === 'string'
          ? configFile.error.messageText
          : JSON.stringify(configFile.error.messageText, null, 2),
      );
    }

    const config = ts.parseJsonConfigFileContent(
      configFile.config,
      ts.sys,
      path.dirname(options.tsconfigPath),
    );

    return ts.createProgram({
      rootNames: config.fileNames,
      options: config.options,
    });
  }

  protected async copyFromCwdToOutput(
    relativePath: string,
    outputPath?: string,
  ): Promise<void> {
    if (!this.outputDirPath) return;
    const absolutePath = path.resolve(process.cwd(), relativePath);
    const finalPath = outputPath
      ? path.join(this.outputDirPath, outputPath)
      : this.outputDirPath;
    await fs.copy(absolutePath, finalPath);
  }

  protected runTsTransformers = async (): Promise<void> => {
    await asyncPool(
      this.program.getSourceFiles(),
      async (sourceFile) => {
        if (sourceFile.isDeclarationFile) return;

        const transpiler = new Transpiler({
          sourceFile,
          transformers: TRANSFORMERS,
          emitters: EMITTERS,
          program: this.program,
          ignoreErrors: this.flags.ignoreErrors,
          includeComments: this.flags.includeComments,
          includeTodos: this.flags.includeTodos,
        });
        this.sourceFileTranspilers.set(sourceFile.fileName, transpiler);
        transpiler.runTsTransformers();
      },
      { concurrency: 100 },
    );
    this.reloadProgram();
  };

  protected emitHaxeCode = async (): Promise<void> => {
    await asyncPool(
      this.sourceFileTranspilers.values(),
      async (transpiler) => {
        const haxeCode = transpiler.emit();
        await this.writeOutputFile(
          transpiler.utils.getHaxeFilePath(),
          haxeCode,
        );
      },
      { concurrency: 100 },
    );
  };

  protected reloadProgram = (): void => {
    const rootNames = this.program.getRootFileNames();
    const options = this.program.getCompilerOptions();

    const sourceFiles: RawSourceFile[] = this.program
      .getSourceFiles()
      .map((sf) => {
        if (this.sourceFileTranspilers.has(sf.fileName)) {
          const file = this.sourceFileTranspilers.get(sf.fileName)!.sourceFile;
          return {
            fileName: file.fileName,
            text: this.printer.printFile(file),
          };
        }
        return sf;
      });

    const host = createInMemoryCompilerHost({ options, sourceFiles });
    this.program = ts.createProgram({
      rootNames,
      options,
      host,
    });
    // warp up
    this.program.getTypeChecker();
    this.program.getCompilerOptions();

    this.sourceFileTranspilers = new Map();
    this.program.getSourceFiles().forEach((sourceFile) => {
      if (sourceFile.isDeclarationFile) return;
      const transpiler = new Transpiler({
        sourceFile,
        transformers: TRANSFORMERS,
        emitters: EMITTERS,
        program: this.program,
        ignoreErrors: this.flags.ignoreErrors,
        includeComments: this.flags.includeComments,
        includeTodos: this.flags.includeTodos,
      });
      this.sourceFileTranspilers.set(sourceFile.fileName, transpiler);
    });
  };

  protected async writeOutputFile(
    fileName: string,
    code: string,
  ): Promise<void> {
    if (!this.outputDirPath) return;
    const haxeFileName = path.join(this.outputDirPath, './src', fileName);
    await fs.outputFile(haxeFileName, code);
  }
}
