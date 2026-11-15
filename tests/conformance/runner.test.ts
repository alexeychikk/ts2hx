import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import {
  attributeBuildErrors,
  evaluate,
  matchesFilter,
  rootPackageOf,
  updateExpectations,
  type CaseResult,
  type ConformanceCase,
} from '../../conformance/runner';
import { parseTargetsHeader } from '../../conformance/runner/cases';
import {
  batchRunner,
  dispatcherSource,
  MAX_REBUILDS,
  type BatchTarget,
  type TargetContext,
} from '../../conformance/runner/targets';

function fakeCase(id: string): ConformanceCase {
  return {
    id,
    rootPackage: rootPackageOf(id),
    caseDir: '/cases',
    entry: `/cases/${id}.ts`,
    files: [`/cases/${id}.ts`],
    targets: ['js', 'cs', 'cpp'],
  };
}

describe('case naming', () => {
  it('maps case ids to valid Haxe packages', () => {
    expect(rootPackageOf('basics/hello')).toBe('cases.basics.hello');
    expect(rootPackageOf('objects/key-order')).toBe('cases.objects.key_order');
    expect(rootPackageOf('control/switch')).toBe('cases.control.switch_');
    expect(rootPackageOf('numbers/2d')).toBe('cases.numbers._2d');
  });

  it('reads the @targets header', () => {
    expect(parseTargetsHeader('// @targets: js\nconsole.log(1);')).toEqual([
      'js',
    ]);
    expect(parseTargetsHeader('// @targets: cpp, js\n')).toEqual(['js', 'cpp']);
    expect(parseTargetsHeader('console.log(1);')).toEqual(['js', 'cs', 'cpp']);
    expect(() => parseTargetsHeader('// @targets: java')).toThrow(
      'Unknown target',
    );
  });

  it('filters by id or glob', () => {
    expect(matchesFilter('classes/inheritance', 'classes/*')).toBe(true);
    expect(
      matchesFilter('classes/inheritance', 'basics/*,classes/inheritance'),
    ).toBe(true);
    expect(matchesFilter('basics/hello', 'classes/*')).toBe(false);
    expect(matchesFilter('basics/hello', undefined)).toBe(true);
  });
});

describe('expectations', () => {
  const results: CaseResult[] = [
    { caseId: 'a/pass', target: 'js', status: 'pass' },
    { caseId: 'a/xpass', target: 'js', status: 'pass' },
    { caseId: 'a/fail', target: 'js', status: 'fail' },
    { caseId: 'a/xfail', target: 'cs', status: 'fail' },
    { caseId: 'a/skip', target: 'cpp', status: 'skip' },
  ];
  const expectations = {
    'a/xpass': { js: 'fail' as const },
    'a/xfail': { cs: 'fail' as const },
    'a/skip': { cpp: 'fail' as const },
  };

  it('classifies results against the manifest', () => {
    expect(evaluate(expectations, results).map((r) => r.outcome)).toEqual([
      'PASS',
      'XPASS',
      'FAIL',
      'XFAIL',
      'SKIP',
    ]);
  });

  it('rewrites only the pairs that ran', () => {
    expect(updateExpectations(expectations, results)).toEqual({
      'a/fail': { js: 'fail' },
      'a/skip': { cpp: 'fail' },
      'a/xfail': { cs: 'fail' },
    });
  });
});

describe('batch build error attribution', () => {
  const cases = [
    fakeCase('basics/hello'),
    fakeCase('basics/hello-world'),
    fakeCase('classes/statics'),
  ];

  it('maps Haxe, C# and C++ errors to the cases they name', () => {
    const log = [
      '/w/hx/basics/hello/src/cases/basics/hello/Main.hx:3: characters 5-9 : String should be Int',
      '/w/hx/classes/statics/src/cases/classes/statics/Main.hx(12,4): error CS0103: The name `x` does not exist [/w/cs/out/App.csproj]',
      './src/cases/classes/statics/Main.cpp:30:5: error: expected primary-expression',
      ' - src/cases/basics/hello_world/Main.cpp',
      '/w/hx/basics/hello_world/src/cases/basics/hello_world/Main.hx(4,1): warning CS0168: unused',
    ].join('\n');
    const culprits = attributeBuildErrors(log, cases);
    expect([...culprits.keys()].sort()).toEqual([
      'basics/hello',
      'classes/statics',
    ]);
    expect(culprits.get('classes/statics')).toHaveLength(2);
  });

  it('maps a missing type in the dispatcher by its dotted package', () => {
    const culprits = attributeBuildErrors(
      'ConformanceMain.hx:6: characters 9-37 : Type not found : cases.basics.hello_world.Main',
      cases,
    );
    expect([...culprits.keys()]).toEqual(['basics/hello-world']);
  });

  it('generates a dispatcher over every case', () => {
    const source = dispatcherSource(cases.slice(0, 1));
    expect(source).toContain(
      'case "basics/hello":\n        cases.basics.hello.Main.main();',
    );
    expect(source).toContain('Sys.exit(64);');
  });
});

describe('batch rebuild budget', () => {
  const cases = ['a/one', 'a/two', 'a/three', 'a/four', 'a/five'].map(fakeCase);

  function haxeError(c: ConformanceCase): string {
    const file = `${c.rootPackage.split('.').join('/')}/Main.hx`;
    return `/w/hx/${c.id}/src/${file}:3: characters 5-9 : String should be Int`;
  }

  it('fails the cases the last errors name with those errors and the rest as unbuilt', async () => {
    const builds: string[][] = [];
    const alwaysBreaksOnFirstCase: BatchTarget = {
      name: 'cpp',
      build(_ctx, remaining) {
        builds.push(remaining.map((c) => c.id));
        return Promise.resolve({ ok: false, log: haxeError(remaining[0]) });
      },
      command: () => ({ file: 'unused', args: [] }),
    };
    const ctx: TargetContext = {
      repoRoot: '/',
      classPaths: new Map(),
      targetDir: fs.mkdtempSync(path.join(os.tmpdir(), 'ts2hx-batch-')),
      env: process.env,
      buildTimeoutMs: 1000,
      runTimeoutMs: 1000,
      concurrency: 1,
    };

    const runs = await batchRunner(alwaysBreaksOnFirstCase)(cases, ctx);

    expect(builds).toHaveLength(MAX_REBUILDS + 1);
    const reasons = Object.fromEntries(
      [...runs].map(([id, run]) => [
        id,
        run.kind === 'build-failed' ? run.reason : run.kind,
      ]),
    );
    expect(reasons['a/one']).toBe(
      `cpp compile error (batch attempt 1):\n${haxeError(cases[0])}`,
    );
    const lastCulprit = cases[MAX_REBUILDS];
    expect(reasons[lastCulprit.id]).toBe(
      `cpp compile error (batch attempt ${MAX_REBUILDS + 1}):\n${haxeError(lastCulprit)}`,
    );
    for (const c of cases.slice(MAX_REBUILDS + 1)) {
      expect(reasons[c.id]).toMatch(/^batch cpp rebuild budget exhausted/);
    }
    expect(Object.values(reasons).join('\n')).not.toContain(
      'without errors attributable',
    );
  });
});
