import * as fs from 'node:fs';
import * as path from 'node:path';
import ts from 'typescript';

import { exec, mapPool } from './process';
import { formatDiagnostics } from './typescript-project';
import type { ConformanceCase, ProgramOutput } from './types';

export interface BaselineOptions {
  cases: readonly ConformanceCase[];
  casesDir: string;
  compilerOptions: ts.CompilerOptions;
  outDir: string;
  timeoutMs: number;
  concurrency: number;
}

/** Compiles every case with tsc to CommonJS, then runs each entry under Node. */
export async function runNodeBaseline(
  options: BaselineOptions,
): Promise<Map<string, ProgramOutput>> {
  const { cases, casesDir, outDir } = options;
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(
    path.join(outDir, 'package.json'),
    '{ "type": "commonjs" }\n',
  );
  const program = ts.createProgram(
    cases.flatMap((c) => c.files),
    {
      ...options.compilerOptions,
      module: ts.ModuleKind.CommonJS,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      rootDir: casesDir,
      outDir,
      noEmit: false,
      declaration: false,
      sourceMap: false,
    },
  );
  const diagnostics = [
    ...ts.getPreEmitDiagnostics(program),
    ...program.emit().diagnostics,
  ];
  if (diagnostics.length > 0) {
    throw new Error(
      `The corpus does not type-check:\n${formatDiagnostics(diagnostics)}`,
    );
  }
  const outputs = await mapPool(cases, options.concurrency, (c) => {
    const script = path
      .join(outDir, path.relative(casesDir, c.entry))
      .replace(/\.ts$/, '.js');
    return exec(process.execPath, [script], {
      cwd: outDir,
      timeoutMs: options.timeoutMs,
    });
  });
  return new Map(cases.map((c, i) => [c.id, outputs[i]]));
}
