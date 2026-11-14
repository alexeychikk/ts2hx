import ts from 'typescript';

import { compileProject } from '../../src/compiler';
import type { Converter } from './types';

/** Converts a case with the new engine (`compileProject`). */
export function compileProjectConverter(
  compilerOptions: ts.CompilerOptions,
): Converter {
  return async ({ entry, files, outDir, rootPackage }) => {
    const program = ts.createProgram(files, {
      ...compilerOptions,
      noEmit: true,
    });
    const result = await compileProject({
      program,
      entry,
      rootPackage,
      outDir,
      targets: ['js', 'cs', 'cpp'],
      copyRuntime: false,
    });
    const errors = result.diagnostics.filter((d) => d.severity === 'error');
    if (errors.length > 0) {
      throw new Error(
        errors
          .map((d) =>
            `${d.file ?? ''}${d.line ? `:${d.line}` : ''} ${d.message}`.trim(),
          )
          .join('\n'),
      );
    }
  };
}
