import ts from 'typescript';
import path from 'path';
import { TRANSFORMERS, Transformer } from '@src/transformers';

export function ts2hx(strings: TemplateStringsArray | string): string {
  const code = typeof strings === 'string' ? strings : strings.join('');
  return new Ts2hx(code).run();
}

export class Ts2hx {
  program?: ts.Program;
  transformer?: Transformer;
  sourceFiles: Array<{ fileName: string; code: string }> = [];

  constructor(code: string, fileName = './main.ts') {
    this.addSourceFile(fileName, code);
  }

  addSourceFile(fileName: string, code: string): Ts2hx {
    this.sourceFiles.push({ fileName, code });
    return this;
  }

  run(): string {
    const program = ts.createProgram(
      this.sourceFiles.map((s) => path.join(process.cwd(), s.fileName)),
      { rootDir: '.' },
      this.createCompilerHost(),
    );
    this.program = program;

    const typeChecker = program.getTypeChecker();
    const transformer = new Transformer({
      compilerOptions: program.getCompilerOptions(),
      sourceFile: program.getSourceFile(this.sourceFiles[0].fileName)!,
      transformers: TRANSFORMERS,
      typeChecker,
      includeComments: true,
    });
    this.transformer = transformer;

    return this.transformer.run();
  }

  protected createCompilerHost(): ts.CompilerHost {
    const host = ts.createCompilerHost({ rootDir: '.' });

    const originalReadFile = host.readFile.bind(host);
    const originalFileExists = host.fileExists.bind(host);
    host.readFile = (fileName: string): string | undefined => {
      const filePath = path.normalize(fileName);
      const fakeFile = this.sourceFiles.find(
        (sf) => path.join(process.cwd(), sf.fileName) === filePath,
      );
      return fakeFile ? fakeFile.code : originalReadFile(fileName);
    };
    host.fileExists = (fileName: string): boolean => {
      const filePath = path.normalize(fileName);
      const fakeFile = this.sourceFiles.find(
        (sf) => path.join(process.cwd(), sf.fileName) === filePath,
      );
      return fakeFile ? true : originalFileExists(fileName);
    };
    host.writeFile = () => undefined;

    return host;
  }
}
