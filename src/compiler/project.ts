import * as fs from 'node:fs';
import * as path from 'node:path';
import ts from 'typescript';

import { compileProject, type CompileDiagnostic } from './index';
import { isValidRootPackage, ROOT_PACKAGE_RULE } from './model/names';

export interface ConvertProjectOptions {
  tsconfigPath: string;
  outDir: string;
  /** Entry source file; without it no `Main.hx` or build files are written. */
  entry?: string;
  rootPackage?: string;
  /** Empty `outDir` first. */
  clean?: boolean;
}

function formatTsDiagnostics(diagnostics: readonly ts.Diagnostic[]): string {
  return ts.formatDiagnostics(diagnostics, {
    getCanonicalFileName: (f) => f,
    getCurrentDirectory: () => process.cwd(),
    getNewLine: () => '\n',
  });
}

/** `ts.Program` of a tsconfig, failing on config errors. */
export function createProgramFromTsconfig(tsconfigPath: string): ts.Program {
  const read = ts.readConfigFile(tsconfigPath, (file) => ts.sys.readFile(file));
  if (read.error) {
    throw new Error(formatTsDiagnostics([read.error]));
  }
  const parsed = ts.parseJsonConfigFileContent(
    read.config,
    ts.sys,
    path.dirname(tsconfigPath),
    undefined,
    tsconfigPath,
  );
  if (parsed.errors.length > 0) {
    throw new Error(formatTsDiagnostics(parsed.errors));
  }
  return ts.createProgram({
    rootNames: parsed.fileNames,
    options: parsed.options,
  });
}

/** Converts a tsconfig project with the new engine (`--engine next`). */
export async function convertProject(
  options: ConvertProjectOptions,
): Promise<CompileDiagnostic[]> {
  if (options.rootPackage && !isValidRootPackage(options.rootPackage)) {
    throw new Error(
      `Invalid --rootPackage "${options.rootPackage}": ${ROOT_PACKAGE_RULE}`,
    );
  }
  const program = createProgramFromTsconfig(options.tsconfigPath);
  if (options.clean) {
    fs.rmSync(options.outDir, { recursive: true, force: true });
  }
  const result = await compileProject({
    program,
    entry: options.entry && path.resolve(options.entry),
    rootPackage: options.rootPackage,
    outDir: options.outDir,
  });
  return result.diagnostics;
}

export function formatDiagnostic(diagnostic: CompileDiagnostic): string {
  const location = diagnostic.file
    ? `${path.relative(process.cwd(), diagnostic.file)}${diagnostic.line ? `:${diagnostic.line}:${diagnostic.column ?? 1}` : ''} `
    : '';
  return `${location}${diagnostic.message}`;
}
