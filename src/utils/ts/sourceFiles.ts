import path from 'path';

export interface RawSourceFile {
  fileName: string;
  text: string;
}

export class IntermediateSourceFile implements RawSourceFile {
  readonly filePath: string;
  readonly dirPath: string;

  constructor(readonly fileName: string, readonly text: string) {
    this.filePath = path.join(process.cwd(), this.fileName);
    this.dirPath = path.join(process.cwd(), path.dirname(this.fileName));
  }
}
