import ts from 'typescript';

import { TypeMapper } from '@src/compiler/frontend/types';
import { printDecl, printType } from '@src/compiler/printer/printer';

import { createProject } from './helpers';

function setup(source: string, withModules: boolean) {
  const project = createProject({ 'main.ts': source });
  const checker = project.program.getTypeChecker();
  const file = project.program.getSourceFile(project.file('main.ts'))!;
  const mapper = new TypeMapper(checker, (sourceFile) =>
    withModules && sourceFile === file
      ? { pack: ['app'], module: 'Main_', name: 'Main_' }
      : undefined,
  );
  return { checker, file, mapper };
}

/** Printed typedefs of a module whose path is `app.Main_`. */
function typedefs(source: string): string[] {
  const { file, mapper } = setup(source, true);
  return mapper.typedefs(file).map(printDecl);
}

function mappedTypes(
  source: string,
  withModules = false,
): Record<string, string> {
  const { checker, file, mapper } = setup(source, withModules);
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
      u: 'Any',
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

  it('maps unknown to Any and tuples to Array<Dynamic>', () => {
    expect(
      mappedTypes(
        [
          'declare const u: unknown;',
          'declare const pair: [string, number];',
          'declare const pairs: Array<[string, number]>;',
          'declare const labeled: [name: string, age?: number];',
        ].join('\n'),
      ),
    ).toEqual({
      u: 'Any',
      pair: 'Array<Dynamic>',
      pairs: 'Array<Array<Dynamic>>',
      labeled: 'Array<Dynamic>',
    });
  });

  it('maps index signatures and Record<string|number, V> to ts2hx.Dict, keyed Records to structures', () => {
    expect(
      mappedTypes(
        [
          'interface Registry { [name: string]: (x: number) => number }',
          'declare const counts: Record<string, number>;',
          'declare const byId: { [id: number]: string };',
          'declare const registry: Registry;',
          "declare const roles: Record<'admin' | 'guest', boolean>;",
          'declare const mixed: { [k: string]: number; size: number };',
        ].join('\n'),
      ),
    ).toEqual({
      counts: 'ts2hx.Dict<Float>',
      byId: 'ts2hx.Dict<String>',
      registry: 'ts2hx.Dict<(x:Float) -> Float>',
      roles: '{ var admin:Bool; var guest:Bool; }',
      mixed: 'Dynamic',
    });
  });

  it('merges intersections of object types and degrades others to Dynamic', () => {
    expect(
      mappedTypes(
        [
          'declare const titled: { name: string } & { title: string };',
          'declare const branded: string & { brand: true };',
        ].join('\n'),
      ),
    ).toEqual({
      titled: '{ var name:String; var title:String; }',
      branded: 'Dynamic',
    });
  });

  it('maps checker-resolved utility, mapped, conditional and indexed types', () => {
    expect(
      mappedTypes(
        [
          'interface User { id: number; name: string; age?: number }',
          'declare const patch: Partial<User>;',
          'declare const frozen: Readonly<Pick<User, "id">>;',
          'declare const full: Required<Omit<User, "name">>;',
          'declare const flags: { [K in keyof User]-?: boolean };',
          'declare const element: number[] extends (infer U)[] ? U : never;',
          'declare const key: keyof User;',
          'declare const id: User["id"];',
          'declare const literal: "a" | "b";',
        ].join('\n'),
      ),
    ).toEqual({
      patch:
        '{ @:optional var id:Null<Float>; @:optional var name:String; @:optional var age:Null<Float>; }',
      frozen: '{ final id:Float; }',
      full: '{ var id:Float; var age:Float; }',
      flags: '{ var id:Bool; var name:Bool; var age:Bool; }',
      element: 'Float',
      key: 'String',
      id: 'Float',
      literal: 'String',
    });
  });

  it('refers to top-level, non-generic interfaces and object aliases by typedef', () => {
    const source = [
      'interface ListNode { value: number; next?: ListNode }',
      'type Point = { x: number; readonly y: number };',
      'interface Box<T> { value: T }',
      'type Shape = { kind: "a" } | { kind: "b" };',
      'declare const node: ListNode;',
      'declare const point: Point;',
      'declare const box: Box<string>;',
      'declare const shape: Shape;',
      'declare const either: Point | ListNode;',
    ].join('\n');
    expect(mappedTypes(source, true)).toEqual({
      node: 'app.Main_.ListNode',
      point: 'app.Main_.Point',
      box: '{ var value:String; }',
      shape: '{ var kind:String; }',
      either: 'Dynamic',
    });
    expect(typedefs(source)).toEqual([
      'typedef ListNode = { var value:Float; @:optional var next:app.Main_.ListNode; };',
      'typedef Point = { var x:Float; final y:Float; };',
    ]);
  });

  it('prints interface methods as structure functions and aliases of typedefs as references', () => {
    expect(
      typedefs(
        [
          'interface Counter { count(): number; add(by?: number): void; reset?: () => void }',
          'type Same = Counter;',
          'interface main_ { a: string }',
          'interface Dict { [k: string]: number }',
        ].join('\n'),
      ),
    ).toEqual([
      'typedef Counter = { function count():Float; function add(?by:Null<Float>):Void; @:optional var reset:() -> Void; };',
      'typedef Same = app.Main_.Counter;',
      'typedef Main__ = { var a:String; };',
    ]);
  });
});
