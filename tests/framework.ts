import ts from 'typescript';
import path from 'path';
import { Converter } from '@src/Converter';
import { IntermediateSourceFile, createInMemoryCompilerHost } from '@src/utils';
import {
  EMITTERS,
  TRANSFORMERS,
  type TransformerUtils,
  Transpiler,
  type TranspilerFlags,
} from '@src/transformers';

export async function ts2hx(
  strings: TemplateStringsArray | string,
  transpilerFlags?: TranspilerFlags,
): Promise<string> {
  const code = typeof strings === 'string' ? strings : strings.join('');
  return await new Ts2hx(code, undefined, transpilerFlags).run();
}

export class Ts2hx {
  converter?: Converter;
  sourceFiles: IntermediateSourceFile[] = [];
  transpilerFlags?: TranspilerFlags;

  constructor(
    text: string,
    fileName = './main.ts',
    transpilerFlags?: TranspilerFlags,
  ) {
    this.transpilerFlags = transpilerFlags;
    this.addSourceFile(fileName, text);
  }

  addSourceFile(fileName: string, text: string): Ts2hx {
    this.sourceFiles.push(new IntermediateSourceFile(fileName, text));
    return this;
  }

  async run(): Promise<string> {
    await this.initConverter().converter!.run();
    return this.getTranspiler().haxeCode!;
  }

  getTranspiler(fileName = this.sourceFiles[0].fileName): Transpiler {
    this.initConverter();

    const filePath = this.sourceFiles.find(
      (s) => s.fileName === fileName,
    )?.filePath;
    if (!filePath) throw new Error(`Source file ${fileName} not found`);

    const transpiler = Array.from(
      this.converter!.sourceFileTranspilers.values(),
    ).find((t) => path.normalize(t.sourceFile.fileName) === filePath);

    if (transpiler) return transpiler;

    const sourceFile = this.converter!.program.getSourceFiles().find(
      (sf) => path.normalize(sf.fileName) === filePath,
    );
    if (!sourceFile) throw new Error(`Source file ${fileName} not found`);

    return new Transpiler({
      sourceFile,
      transformers: TRANSFORMERS,
      emitters: EMITTERS,
      program: this.converter!.program,
      flags: this.transpilerFlags,
    });
  }

  getUtils(fileName?: string): TransformerUtils {
    const transpiler = this.getTranspiler(fileName);
    return transpiler.utils;
  }

  initConverter(): Ts2hx {
    if (this.converter) return this;

    const options: ts.CompilerOptions = { rootDir: '.' };
    const program = ts.createProgram(
      this.sourceFiles.map((s) => path.join(process.cwd(), s.fileName)),
      options,
      createInMemoryCompilerHost({
        options,
        sourceFiles: this.sourceFiles,
      }),
    );

    this.converter = new Converter({
      program,
      transpilerFlags: {
        includeComments: true,
        transformAsyncAwait: true,
        ...this.transpilerFlags,
      },
    });

    return this;
  }
}
