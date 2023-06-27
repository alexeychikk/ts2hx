import ts from 'typescript';
import { TRANSFORMERS, Transformer } from '@src/transformers';

export function ts2hx(strings: TemplateStringsArray | string): string {
  const code = typeof strings === 'string' ? strings : strings.join('');
  const fileName = 'testDummy.ts';
  const sourceFile = ts.createSourceFile(
    fileName,
    code,
    ts.ScriptTarget.ESNext,
    true,
  );

  const program = ts.createProgram([sourceFile.fileName], { rootDir: '.' });
  const typeChecker = program.getTypeChecker();

  const transformer = new Transformer({
    compilerOptions: program.getCompilerOptions(),
    sourceFile,
    transformers: TRANSFORMERS,
    typeChecker,
  });

  return transformer.run();
}
