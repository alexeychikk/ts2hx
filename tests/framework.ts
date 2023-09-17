import ts from 'typescript';
import path from 'path';
import { Converter } from '@src/Converter';

export async function ts2hx(
  strings: TemplateStringsArray | string,
): Promise<string> {
  const code = typeof strings === 'string' ? strings : strings.join('');
  return await new Ts2hx(code).run();
}

export class Ts2hx {
  converter?: Converter;
  sourceFiles: FakeSourceFile[] = [];

  constructor(code: string, fileName = './main.ts') {
    this.addSourceFile(fileName, code);
  }

  addSourceFile(fileName: string, code: string): Ts2hx {
    this.sourceFiles.push(new FakeSourceFile(fileName, code));
    return this;
  }

  async run(): Promise<string> {
    const program = ts.createProgram(
      this.sourceFiles.map((s) => path.join(process.cwd(), s.fileName)),
      { rootDir: '.' },
      this.createCompilerHost(),
    );

    this.converter = new Converter({
      program,
      flags: { includeComments: true },
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

  protected createCompilerHost(): ts.CompilerHost {
    const host = ts.createCompilerHost({ rootDir: '.' });

    const originalReadFile = host.readFile.bind(host);
    const originalFileExists = host.fileExists.bind(host);
    const originalReadDirectory = host.readDirectory?.bind(host);
    const originalDirectoryExists = host.directoryExists?.bind(host);

    host.readFile = (fileName: string): string | undefined => {
      const filePath = path.normalize(fileName);
      const fakeFile = this.sourceFiles.find((sf) => sf.filePath === filePath);
      return fakeFile ? fakeFile.code : originalReadFile(fileName);
    };
    host.fileExists = (fileName: string): boolean => {
      const filePath = path.normalize(fileName);
      const fakeFile = this.sourceFiles.find((sf) => sf.filePath === filePath);
      return fakeFile ? true : originalFileExists(fileName);
    };
    host.writeFile = () => undefined;
    host.readDirectory = (rootDir, extensions, excludes, includes, depth) => {
      // TODO: this doesn't seem to be called at all
      return (
        originalReadDirectory?.(
          rootDir,
          extensions,
          excludes,
          includes,
          depth,
        ) ?? []
      );
    };
    host.directoryExists = (directoryName) => {
      const directoryPath = path.normalize(directoryName);
      const fakeFile = this.sourceFiles.find((sf) =>
        sf.dirPath.includes(directoryPath),
      );
      return fakeFile
        ? true
        : originalDirectoryExists?.(directoryName) ?? false;
    };

    return host;
  }
}

export class FakeSourceFile {
  readonly filePath: string;
  readonly dirPath: string;

  constructor(readonly fileName: string, readonly code: string) {
    this.filePath = path.join(process.cwd(), this.fileName);
    this.dirPath = path.join(process.cwd(), path.dirname(this.fileName));
  }
}
