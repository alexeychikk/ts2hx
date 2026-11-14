import type ts from 'typescript';

export * from './ir/types';

export type Target = 'js' | 'cs' | 'cpp';

export interface CompileOptions {
  program: ts.Program;
  /** Entry module (absolute path of a source file); generates `Main.hx` running module init + event loop. */
  entry?: string;
  /** Package prefix for every generated module, e.g. `cases.basics.hello`. */
  rootPackage?: string;
  /** When set, writes `src/**.hx`, the `ts2hx/` runtime and `build-<target>.hxml` files. */
  outDir?: string;
  targets?: Target[];
}

export interface CompileDiagnostic {
  severity: 'error' | 'warning';
  message: string;
  file?: string;
  line?: number;
  column?: number;
}

export interface EmittedModule {
  /** Path relative to `<outDir>/src`, e.g. `cases/basics/hello/Main.hx`. */
  path: string;
  code: string;
}

export interface CompileResult {
  modules: EmittedModule[];
  diagnostics: CompileDiagnostic[];
}

/** Public entry point of the new engine (ADR 0001). */
export function compileProject(
  options: CompileOptions,
): Promise<CompileResult> {
  return Promise.reject(
    new Error(
      `compileProject is not implemented yet (requested for ${
        options.entry ?? 'a project without entry'
      })`,
    ),
  );
}
