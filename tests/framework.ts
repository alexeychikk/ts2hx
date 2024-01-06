import ts from 'typescript';
import path from 'path';
import { Converter } from '@src/Converter';
import { IntermediateSourceFile, createInMemoryCompilerHost } from '@src/utils';
import { type TranspilerFlags } from '@src/transformers';

export async function ts2hx(
  strings: TemplateStringsArray | string,
  transpilerFlags?: TranspilerFlags,
): Promise<string> {
  const code = typeof strings === 'string' ? strings : strings.join('');
  return await new Ts2hx(code).run(transpilerFlags);
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

  async run(transpilerFlags?: TranspilerFlags): Promise<string> {
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
        ...this.transpilerFlags,
        ...transpilerFlags,
      },
    });

    await this.converter.run();

    const transpiler = Array.from(
      this.converter.sourceFileTranspilers.values(),
    ).find(
      (transpiler) =>
        path.normalize(transpiler.sourceFile.fileName) ===
        this.sourceFiles[0].filePath,
    )!;

    return transpiler.haxeCode!;
  }
}
