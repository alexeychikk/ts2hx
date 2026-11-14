import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import ts from 'typescript';

import { compileProject, type CompileOptions } from '@src/compiler';

/** Options of the conformance corpus (`conformance/tsconfig.base.json`). */
export const CASE_COMPILER_OPTIONS: ts.CompilerOptions = {
  strict: true,
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  lib: ['lib.es2022.d.ts'],
  types: ['node'],
  skipLibCheck: true,
  moduleDetection: ts.ModuleDetectionKind.Force,
  noEmit: true,
};

export function tempDir(prefix = 'ts2hx-compiler-'): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

export interface TestProject {
  dir: string;
  program: ts.Program;
  file: (relative: string) => string;
}

/** Writes `files` (relative path → source) to a temp dir and creates their program. */
export function createProject(
  files: Record<string, string>,
  options: ts.CompilerOptions = {},
): TestProject {
  const dir = fs.realpathSync(tempDir());
  const file = (relative: string) => path.join(dir, relative);
  for (const [relative, source] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(file(relative)), { recursive: true });
    fs.writeFileSync(file(relative), source);
  }
  const program = ts.createProgram(Object.keys(files).map(file), {
    ...CASE_COMPILER_OPTIONS,
    ...options,
  });
  return { dir, program, file };
}

/** Compiles a single-module program with entry `main.ts` and returns its emitted code by path. */
export async function compileSources(
  files: Record<string, string>,
  options: Partial<CompileOptions> = {},
) {
  const project = createProject(files);
  const result = await compileProject({
    program: project.program,
    entry: project.file(Object.keys(files)[0]),
    ...options,
  });
  const code = Object.fromEntries(result.modules.map((m) => [m.path, m.code]));
  return { ...result, code, project };
}
