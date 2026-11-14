import ts from 'typescript';

import { TypeMapper } from '@src/compiler/frontend/types';
import { printType } from '@src/compiler/printer/printer';

import { createProject } from './helpers';

function mappedTypes(source: string): Record<string, string> {
  const project = createProject({ 'main.ts': source });
  const checker = project.program.getTypeChecker();
  const mapper = new TypeMapper(checker);
  const file = project.program.getSourceFile(project.file('main.ts'))!;
  const result: Record<string, string> = {};
  for (const statement of file.statements) {
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        result[declaration.name.getText()] = printType(
          mapper.map(checker.getTypeAtLocation(declaration.name)),
        );
      }
    }
  }
  return result;
}

describe('TypeMapper', () => {
  it('maps primitives, nullable unions, arrays, functions and object shapes', () => {
    expect(
      mappedTypes(
        [
          'declare const n: number, s: string, b: boolean;',
          'declare const maybe: number | undefined, text: string | null;',
          'declare const mixed: number | string, u: unknown;',
          'declare const xs: number[], f: (x: number) => string;',
          'declare const o: { a: number; b?: string };',
        ].join('\n'),
      ),
    ).toEqual({
      n: 'Float',
      s: 'String',
      b: 'Bool',
      maybe: 'Null<Float>',
      text: 'String',
      mixed: 'Dynamic',
      u: 'Dynamic',
      xs: 'Array<Float>',
      f: '(x:Float) -> String',
      o: '{ var a:Float; @:optional var b:String; }',
    });
  });

  it('maps recursive shapes without looping', () => {
    expect(
      mappedTypes('interface Node { next: Node }\ndeclare const head: Node;'),
    ).toEqual({ head: '{ var next:Dynamic; }' });
  });
});
