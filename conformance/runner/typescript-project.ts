import * as path from 'node:path';
import ts from 'typescript';

const NO_INPUTS_FOUND = 18003;

/** Compiler options of a tsconfig; its file list is ignored, the runner passes case files itself. */
export function readCompilerOptions(tsconfigPath: string): ts.CompilerOptions {
  const read = ts.readConfigFile(tsconfigPath, (file) => ts.sys.readFile(file));
  if (read.error) {
    throw new Error(formatDiagnostics([read.error]));
  }
  const parsed = ts.parseJsonConfigFileContent(
    read.config,
    ts.sys,
    path.dirname(tsconfigPath),
    undefined,
    tsconfigPath,
  );
  const errors = parsed.errors.filter((e) => e.code !== NO_INPUTS_FOUND);
  if (errors.length > 0) {
    throw new Error(formatDiagnostics(errors));
  }
  return parsed.options;
}

export function formatDiagnostics(
  diagnostics: readonly ts.Diagnostic[],
): string {
  return ts.formatDiagnostics(diagnostics, {
    getCanonicalFileName: (f) => f,
    getCurrentDirectory: () => process.cwd(),
    getNewLine: () => '\n',
  });
}
