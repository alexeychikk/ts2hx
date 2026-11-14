import * as path from 'node:path';
import type ts from 'typescript';

import {
  buildFiles,
  copyRuntime,
  mainSource,
  writeFiles,
  type EmittedFile,
} from './emit/project-emit';
import { ModuleFrontend } from './frontend/frontend';
import { buildProjectModel, MAIN_CLASS } from './model/project-model';
import { createPassContext, runPasses } from './passes';
import { printModule } from './printer/printer';

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
  /** Copy the runtime into `<outDir>/src/ts2hx` (default true); off when the build adds `runtime/` itself. */
  copyRuntime?: boolean;
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

function modulePath(pack: string[], name: string): string {
  return [...pack, `${name}.hx`].join('/');
}

/** Public entry point of the new engine (ADR 0001). */
export function compileProject(
  options: CompileOptions,
): Promise<CompileResult> {
  return Promise.resolve().then(() => compile(options));
}

function compile(options: CompileOptions): CompileResult {
  const diagnostics: CompileDiagnostic[] = [];
  const model = buildProjectModel(options.program, {
    entry: options.entry,
    rootPackage: options.rootPackage,
  });
  const reportUnsupported = (
    message: string,
    pos?: { file: string; line: number; column: number },
  ): void => {
    diagnostics.push({
      severity: 'warning',
      message: `TODO(ts2hx): ${message}`,
      ...pos,
    });
  };
  const passContext = createPassContext(reportUnsupported);
  const modules: EmittedModule[] = model.modules.map((info) => {
    const ir = new ModuleFrontend(model, info, ({ message, pos }) =>
      reportUnsupported(message, pos),
    ).convert();
    const lowered = runPasses(ir, passContext);
    return {
      path: modulePath(lowered.pack, lowered.name),
      code: printModule(lowered),
    };
  });
  if (model.entry) {
    modules.push({
      path: modulePath(model.rootPackage, MAIN_CLASS),
      code: mainSource(
        model.rootPackage,
        model.initOrder.map((m) => m.path),
      ),
    });
  }
  if (options.outDir) {
    const srcDir = path.join(options.outDir, 'src');
    const files: EmittedFile[] = modules.map((m) => ({
      path: path.join('src', m.path),
      content: m.code,
    }));
    if (model.entry) {
      files.push(...buildFiles(model.rootPackage));
    }
    writeFiles(options.outDir, files);
    if (options.copyRuntime ?? true) {
      copyRuntime(srcDir);
    }
  }
  return { modules, diagnostics };
}
