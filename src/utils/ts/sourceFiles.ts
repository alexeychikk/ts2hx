import path from 'path';

export interface RawSourceFile {
  fileName: string;
  text: string;
}

export class IntermediateSourceFile implements RawSourceFile {
  readonly filePath: string;
  readonly dirPath: string;

  constructor(readonly fileName: string, readonly text: string) {
    const isAbsolute = path.isAbsolute(this.fileName);
    this.filePath = path.normalize(
      isAbsolute ? this.fileName : path.join(process.cwd(), this.fileName),
    );
    this.dirPath = path.normalize(
      isAbsolute
        ? path.dirname(this.fileName)
        : path.join(process.cwd(), path.dirname(this.fileName)),
    );
  }
}
