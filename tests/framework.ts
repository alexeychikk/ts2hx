import ts from 'typescript';
import path from 'path';
import { Converter } from '@src/Converter';
import { IntermediateSourceFile, createInMemoryCompilerHost } from '@src/utils';

export async function ts2hx(
  strings: TemplateStringsArray | string,
): Promise<string> {
  const code = typeof strings === 'string' ? strings : strings.join('');
  return await new Ts2hx(code).run();
}

export class Ts2hx {
  converter?: Converter;
  sourceFiles: IntermediateSourceFile[] = [];

  constructor(text: string, fileName = './main.ts') {
    this.addSourceFile(fileName, text);
  }

  addSourceFile(fileName: string, text: string): Ts2hx {
    this.sourceFiles.push(new IntermediateSourceFile(fileName, text));
    return this;
  }

  async run(): Promise<string> {
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
      transpilerFlags: { includeComments: true },
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
