import ts from 'typescript';

import {
  buildProjectModel,
  type ModuleValue,
} from '@src/compiler/model/project-model';

import { createProject } from './helpers';

function pathsOf(
  files: Record<string, string>,
  rootPackage?: string,
  options?: ts.CompilerOptions,
) {
  const project = createProject(files, options);
  const model = buildProjectModel(project.program, {
    entry: project.file(Object.keys(files)[0]),
    rootPackage,
  });
  const describe = (m: (typeof model.modules)[number]) =>
    [...m.path.pack, m.path.module].join('.');
  return {
    modules: Object.fromEntries(
      model.modules.map((m) => [
        m.sourceFile.fileName.slice(project.dir.length + 1),
        describe(m),
      ]),
    ),
    initOrder: model.initOrder.map(describe),
  };
}

describe('ProjectModel', () => {
  it('maps files to packages and modules under the root package', () => {
    const { modules } = pathsOf(
      {
        'main.ts': 'export {};',
        'lib/my-file.ts': 'export {};',
        'Lib/Deep/x.ts': 'export {};',
      },
      'app.core',
    );
    expect(modules).toEqual({
      'main.ts': 'app.core.Main_2',
      'lib/my-file.ts': 'app.core.lib.My_file',
      'Lib/Deep/x.ts': 'app.core.lib.deep.X',
    });
  });

  it('renames modules colliding with each other, Main or the Haxe std', () => {
    const { modules } = pathsOf({
      'entry.ts': 'export {};',
      'a/foo.ts': 'export {};',
      'a/Foo.ts': 'export {};',
      'math.ts': 'export {};',
      'ts2hx/x.ts': 'export {};',
    });
    expect(modules['a/Foo.ts']).toBe('a.Foo');
    expect(modules['a/foo.ts']).toBe('a.Foo_2');
    expect(modules['math.ts']).toBe('Math_');
    expect(modules['ts2hx/x.ts']).toBe('ts2hx_.X');
  });

  it('orders module init as a post-order DFS over imports from the entry', () => {
    const { initOrder } = pathsOf({
      'main.ts':
        "import './b';\nimport { a } from './a';\nexport * from './c';\na;",
      'a.ts': "import './b';\nexport const a = 1;",
      'b.ts': "import './main';\nexport {};",
      'c.ts': "import type { T } from './types';\nexport const c: T = 1;",
      'types.ts': 'export type T = number;',
      'unused.ts': 'export {};',
    });
    expect(initOrder).toEqual(['B', 'A', 'C', 'Main_2']);
  });

  it('drops imports TS elides: types only, `typeof` queries, type re-exports', () => {
    const { initOrder } = pathsOf({
      'main.ts': [
        "import './side';",
        "import { I } from './iface';",
        "import { v } from './query';",
        "import { type U, w } from './mixed';",
        "export * from './types-only';",
        "export { type T } from './reexported-type';",
        "export { x } from './reexported-value';",
        "import * as ns from './ns';",
        "import { unused } from './unused';",
        'const i: I = { a: 1 };',
        'let q: typeof v = 1;',
        'let u: U = w;',
        'ns.n;',
      ].join('\n'),
      'side.ts': 'export {};',
      'iface.ts': 'export interface I { a: number }',
      'query.ts': 'export const v = 1;',
      'mixed.ts': 'export type U = number;\nexport const w = 1;',
      'types-only.ts': 'export type A = string;',
      'reexported-type.ts': 'export type T = string;',
      'reexported-value.ts': 'export const x = 1;',
      'ns.ts': 'export const n = 1;',
      'unused.ts': 'export const unused = 1;',
    });
    expect(initOrder).toEqual([
      'Side',
      'Mixed',
      'Reexported_value',
      'Ns',
      'Main_2',
    ]);
  });

  it('keeps every import but `import type` under verbatimModuleSyntax', () => {
    const { initOrder } = pathsOf(
      {
        'main.ts': [
          "import type { T } from './type-import';",
          "import { type U } from './inline-type';",
          "import { v } from './query';",
          "import { unused } from './unused';",
          "export type { W } from './type-export';",
          "export * from './types-only';",
          'let q: typeof v = 1;',
          'let u: U = q;',
        ].join('\n'),
        'type-import.ts': 'export type T = number;',
        'inline-type.ts': 'export type U = number;',
        'query.ts': 'export const v = 1;',
        'unused.ts': 'export const unused = 1;',
        'type-export.ts': 'export type W = number;',
        'types-only.ts': 'export type A = string;',
      },
      undefined,
      { verbatimModuleSyntax: true },
    );
    expect(initOrder).toEqual([
      'Inline_type',
      'Query',
      'Unused',
      'Types_only',
      'Main_2',
    ]);
  });

  it('keeps an import whose binding is only re-exported as a value', () => {
    const { initOrder } = pathsOf({
      'main.ts':
        "import { a } from './a';\nimport { T } from './t';\nexport { a, T };",
      'a.ts': 'export const a = 1;',
      't.ts': 'export type T = number;',
    });
    expect(initOrder).toEqual(['A', 'Main_2']);
  });

  it('names module values: keywords escaped, collisions renamed', () => {
    const project = createProject({
      'main.ts': [
        'type shape = { a: number };',
        'export const cast = 1, $v = 2, _v = 3;',
        'export function Shape() {}',
        'export function Main_2() {}',
        'export function __init() {}',
        'export const lib = 4;',
        'export default function () {}',
      ].join('\n'),
      'lib/x.ts': 'export {};',
    });
    const model = buildProjectModel(project.program);
    const main = model.modules.find((m) => m.path.module === 'Main_2')!;
    expect([...main.fields.values()]).toEqual([
      'cast_',
      '_v',
      '_v_2',
      'Shape_2',
      'Main_2_2',
      '__init_2',
      'lib_2',
      'default_',
    ]);
    expect([...model.reservedLocalNames].sort()).toEqual([
      'Main_2',
      'haxe',
      'lib',
      'ts2hx',
    ]);
  });

  it('names hoisted classes after their binding, renaming collisions', () => {
    const project = createProject({
      'main.ts': [
        'interface Point { x: number }',
        'class Local {}',
        'export const Point2 = 1;',
        'const Point_ = class { x = 1 };',
        'function f() { class Local {} return class {}; }',
        'function g() { class Local {} return Local; }',
      ].join('\n'),
    });
    const model = buildProjectModel(project.program);
    const main = model.modules.find((m) => m.path.module === 'Main_2')!;
    expect([...main.hoistedClasses.values()]).toEqual([
      'Point_',
      'Local_2',
      'Class',
      'Local_3',
    ]);
  });

  it('resolves imports, re-exports and namespaces to the declaring module', () => {
    const project = createProject({
      'main.ts': [
        "import { f as g, ns, d, e, h } from './index';",
        "import * as all from './index';",
        'g; ns; d; e; h; all;',
      ].join('\n'),
      'index.ts': [
        "export { f } from './impl';",
        "export * from './star';",
        "export * as ns from './impl';",
        "export { default as d } from './impl';",
        "export { default as e } from './expr';",
      ].join('\n'),
      'impl.ts': 'export function f() {}\nexport default function () {}',
      'star.ts': 'const local = 1;\nexport { local as h };',
      'expr.ts': 'export default 1 + 1;',
    });
    const model = buildProjectModel(project.program);
    const main = model.modules.find((m) => m.path.module === 'Main_2')!;
    const describeValue = (value: ModuleValue | undefined) =>
      value?.kind === 'field'
        ? `${value.module.path.module}.${value.name}`
        : value && `namespace ${value.module.path.module}`;
    const identifiers: ts.Identifier[] = [];
    const collect = (node: ts.Node): void => {
      if (ts.isIdentifier(node)) identifiers.push(node);
      ts.forEachChild(node, collect);
    };
    main.sourceFile.statements.slice(2).forEach(collect);
    expect(
      identifiers.map((id) =>
        describeValue(
          model.resolveValue(model.checker.getSymbolAtLocation(id)!),
        ),
      ),
    ).toEqual([
      'Impl.f',
      'namespace Impl',
      'Impl.default_',
      'Expr.default_',
      'Star.local',
      'namespace Index',
    ]);
  });

  it('rejects an entry outside the program', () => {
    const project = createProject({ 'main.ts': 'export {};' });
    expect(() =>
      buildProjectModel(project.program, { entry: project.file('other.ts') }),
    ).toThrow(/not a source file/);
  });

  it.each(['app.class', 'ts2hx'])(
    'rejects the root package %s',
    (rootPackage) => {
      expect(() => pathsOf({ 'main.ts': 'export {};' }, rootPackage)).toThrow(
        `Invalid root package "${rootPackage}"`,
      );
    },
  );
});
