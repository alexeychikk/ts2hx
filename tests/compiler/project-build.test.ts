import { spawnSync } from 'node:child_process';
import * as path from 'node:path';

import { parseTargets } from '../../conformance/runner';
import { toolEnv } from '../../conformance/runner/haxe-env';
import type { Target } from '@src/compiler';

import { compileSources, tempDir } from './helpers';

const REPO_ROOT = path.resolve(__dirname, '../..');
const TARGETS = parseTargets(process.env.TS2HX_SELFTEST_TARGETS ?? 'js');
const TIMEOUT_MS = 10 * 60_000;

/** A program whose unmapped constructs sit in statement, numeric and string positions. */
const SOURCE = `console.log('before', 0.1 + 0.2);
class Unmapped {}
console.log(1 + [1].length, \`t\${[2].length}\`, String([3].length));
console.log('after');
`;

function sh(command: string, args: string[]) {
  return spawnSync(command, args, {
    cwd: REPO_ROOT,
    env: toolEnv(REPO_ROOT),
    encoding: 'utf8',
  });
}

function buildAndRun(target: Target, outDir: string) {
  const out = (relative: string) => path.join(outDir, relative);
  const build = sh('haxe', ['--cwd', outDir, `build-${target}.hxml`]);
  expect(build.stderr).toBe('');
  expect(build.status).toBe(0);
  switch (target) {
    case 'js':
      return sh(process.execPath, [out('out/main.js')]);
    case 'cpp':
      return sh(out('out/cpp/Main'), []);
    case 'cs': {
      const dotnet = sh('dotnet', [
        'build',
        out('out/cs'),
        '-c',
        'Release',
        '-o',
        out('out/cs/bin'),
        '-nologo',
        '-v',
        'q',
      ]);
      expect({ status: dotnet.status, stdout: dotnet.stdout }).toMatchObject({
        status: 0,
      });
      return sh('dotnet', [out('out/cs/bin/App.dll')]);
    }
  }
}

describe.each(TARGETS)('emitted project on %s', (target) => {
  it(
    'builds with the generated hxml and throws at the first unsupported construct',
    async () => {
      const outDir = tempDir('ts2hx-project-');
      await compileSources(
        { 'main.ts': SOURCE },
        { outDir, rootPackage: 'app' },
      );
      const run = buildAndRun(target, outDir);
      expect(run.stdout.replace(/\r\n/g, '\n')).toBe(
        'before 0.30000000000000004\n',
      );
      expect(run.status).toBe(1);
      expect(run.stderr).toContain(
        'ts2hx: unsupported: ClassDeclaration is not supported yet',
      );
    },
    TIMEOUT_MS,
  );
});
