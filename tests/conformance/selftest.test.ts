import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import {
  parseTargets,
  runConformance,
  type ConformanceOptions,
  type EvaluatedResult,
} from '../../conformance/runner';
import { fakeConverter } from './fakeConverter';

const FIXTURES = path.join(__dirname, 'fixtures');
const SELFTEST_TARGETS = parseTargets(
  process.env.TS2HX_SELFTEST_TARGETS ?? 'js',
);
const TIMEOUT_MS = 20 * 60_000;

function tempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ts2hx-conformance-'));
}

function run(options: ConformanceOptions) {
  const lines: string[] = [];
  return runConformance({
    casesDir: path.join(FIXTURES, 'cases'),
    expectationsFile: path.join(FIXTURES, 'expectations.json'),
    workDir: path.join(tempDir(), 'work'),
    converter: fakeConverter(path.join(FIXTURES, 'haxe')),
    log: (line) => lines.push(line),
    ...options,
  });
}

function byCase(results: EvaluatedResult[]): Record<string, EvaluatedResult> {
  return Object.fromEntries(results.map((r) => [r.caseId, r]));
}

describe.each(SELFTEST_TARGETS)('conformance runner on %s', (target) => {
  it(
    'matches Node output, isolates a broken case and honours expectations',
    async () => {
      const report = await run({ targets: [target] });
      const results = byCase(report.results);

      expect(results['selftest/pass'].outcome).toBe('PASS');
      expect(results['selftest/mismatch'].outcome).toBe('XFAIL');
      expect(results['selftest/mismatch'].reason).toContain(
        '+ the answer is 41',
      );
      expect(results['selftest/broken'].outcome).toBe('XFAIL');
      expect(results['selftest/broken'].reason).toMatch(
        target === 'js'
          ? /^haxe --js failed/
          : new RegExp(`^${target} compile error`),
      );
      expect(report.ok).toBe(true);
    },
    TIMEOUT_MS,
  );
});

describe('conformance expectations', () => {
  it(
    'fails the run on an unexpected pass or failure and records them with --update-expectations',
    async () => {
      const expectationsFile = path.join(tempDir(), 'expectations.json');
      fs.writeFileSync(
        expectationsFile,
        JSON.stringify({
          'selftest/pass': { js: 'fail' },
          'other/case': { cs: 'fail' },
        }),
      );

      const report = await run({ targets: ['js'], expectationsFile });
      const results = byCase(report.results);
      expect(report.ok).toBe(false);
      expect(results['selftest/pass'].outcome).toBe('XPASS');
      expect(results['selftest/mismatch'].outcome).toBe('FAIL');
      expect(results['selftest/broken'].outcome).toBe('FAIL');

      const updated = await run({
        targets: ['js'],
        expectationsFile,
        updateExpectations: true,
      });
      expect(updated.ok).toBe(true);
      expect(JSON.parse(fs.readFileSync(expectationsFile, 'utf8'))).toEqual({
        'other/case': { cs: 'fail' },
        'selftest/broken': { js: 'fail' },
        'selftest/mismatch': { js: 'fail' },
      });
    },
    TIMEOUT_MS,
  );

  it(
    'skips targets excluded by --filter',
    async () => {
      const report = await run({ targets: ['js'], filter: 'selftest/pass' });
      expect(report.results.map((r) => `${r.caseId} ${r.outcome}`)).toEqual([
        'selftest/pass PASS',
      ]);
    },
    TIMEOUT_MS,
  );
});
