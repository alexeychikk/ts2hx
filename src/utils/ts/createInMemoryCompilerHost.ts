import ts from 'typescript';
import path from 'path';
import { IntermediateSourceFile, type RawSourceFile } from './sourceFiles';

export function createInMemoryCompilerHost(params: {
  options: ts.CompilerOptions;
  sourceFiles: Iterable<RawSourceFile>;
}): ts.CompilerHost {
  const host = ts.createCompilerHost(params.options, true);
  const sourceFilesArray: IntermediateSourceFile[] = (
    Array.isArray(params.sourceFiles)
      ? params.sourceFiles
      : Array.from(params.sourceFiles)
  ).map((raw) =>
    raw instanceof IntermediateSourceFile
      ? raw
      : new IntermediateSourceFile(raw.fileName, raw.text),
  );

  const originalReadFile = host.readFile.bind(host);
  const originalFileExists = host.fileExists.bind(host);
  const originalReadDirectory = host.readDirectory?.bind(host);
  const originalDirectoryExists = host.directoryExists?.bind(host);

  host.readFile = (fileName: string): string | undefined => {
    const filePath = path.normalize(fileName);
    const fakeFile = sourceFilesArray.find((sf) => sf.filePath === filePath);
    return fakeFile ? fakeFile.text : originalReadFile(fileName);
  };
  host.fileExists = (fileName: string): boolean => {
    const filePath = path.normalize(fileName);
    const fakeFile = sourceFilesArray.find((sf) => sf.filePath === filePath);
    return !!fakeFile || originalFileExists(fileName);
  };
  host.writeFile = () => undefined;
  host.readDirectory = (rootDir, extensions, excludes, includes, depth) => {
    // TODO: this doesn't seem to be called at all
    return (
      originalReadDirectory?.(rootDir, extensions, excludes, includes, depth) ??
      []
    );
  };
  host.directoryExists = (directoryName) => {
    const directoryPath = path.normalize(directoryName);
    const fakeFile = sourceFilesArray.find((sf) =>
      sf.dirPath.includes(directoryPath),
    );
    return !!fakeFile || !!originalDirectoryExists?.(directoryName);
  };

  return host;
}
