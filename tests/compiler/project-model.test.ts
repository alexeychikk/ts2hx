import { buildProjectModel } from '@src/compiler/model/project-model';

import { createProject } from './helpers';

function pathsOf(files: Record<string, string>, rootPackage?: string) {
  const project = createProject(files);
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
