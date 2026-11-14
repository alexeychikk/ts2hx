import * as fs from 'node:fs';
import * as path from 'node:path';

import { discoverCases } from './cases';
import { compileProjectConverter } from './default-converter';
import {
  evaluate,
  isUnexpected,
  readExpectations,
  sameBehaviour,
  updateExpectations,
  writeExpectations,
} from './expectations';
import { toolEnv } from './haxe-env';
import { runNodeBaseline } from './node-baseline';
import { mapPool } from './process';
import { diffOutputs, formatResult, formatSummary } from './report';
import { TARGET_RUNNERS, type TargetContext, type TargetRun } from './targets';
import { readCompilerOptions } from './typescript-project';
import {
  ALL_TARGETS,
  type CaseResult,
  type ConformanceCase,
  type Converter,
  type EvaluatedResult,
  type ProgramOutput,
  type Target,
} from './types';

export * from './types';
export {
  discoverCases,
  matchesFilter,
  parseTargets,
  rootPackageOf,
} from './cases';
export { attributeBuildErrors } from './build-errors';
export { evaluate, updateExpectations } from './expectations';

export interface ConformanceOptions {
  repoRoot?: string;
  casesDir?: string;
  expectationsFile?: string;
  tsconfigPath?: string;
  /** Scratch directory for Node, Haxe and target output; `.conformance/` by default. */
  workDir?: string;
  runtimeDir?: string;
  targets?: Target[];
  filter?: string;
  converter?: Converter;
  updateExpectations?: boolean;
  keep?: boolean;
  concurrency?: number;
  runTimeoutMs?: number;
  buildTimeoutMs?: number;
  log?: (line: string) => void;
}

export interface ConformanceReport {
  results: EvaluatedResult[];
  ok: boolean;
}

export function findRepoRoot(from: string = __dirname): string {
  let dir = from;
  while (!fs.existsSync(path.join(dir, 'package.json'))) {
    const parent = path.dirname(dir);
    if (parent === dir) {
      throw new Error(`No package.json above ${from}`);
    }
    dir = parent;
  }
  return dir;
}

type Conversion =
  { ok: true; classPath: string } | { ok: false; reason: string };

async function convertAll(
  cases: readonly ConformanceCase[],
  converter: Converter,
  hxDir: string,
  concurrency: number,
): Promise<Map<string, Conversion>> {
  const conversions = await mapPool(
    cases,
    concurrency,
    async (c): Promise<Conversion> => {
      const outDir = path.join(hxDir, c.id);
      fs.mkdirSync(outDir, { recursive: true });
      try {
        await converter({
          caseId: c.id,
          caseDir: c.caseDir,
          entry: c.entry,
          files: c.files,
          outDir,
          rootPackage: c.rootPackage,
        });
        return { ok: true, classPath: path.join(outDir, 'src') };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { ok: false, reason: `conversion failed: ${message}` };
      }
    },
  );
  return new Map(cases.map((c, i) => [c.id, conversions[i]]));
}

function resultOf(
  c: ConformanceCase,
  target: Target,
  expected: ProgramOutput,
  conversion: Conversion,
  run: TargetRun | undefined,
): CaseResult {
  const base = { caseId: c.id, target };
  if (!c.targets.includes(target)) {
    return { ...base, status: 'skip', reason: '@targets header excludes it' };
  }
  if (!conversion.ok) {
    return { ...base, status: 'fail', reason: conversion.reason };
  }
  if (!run) {
    return { ...base, status: 'fail', reason: 'no run recorded' };
  }
  if (run.kind === 'build-failed') {
    return { ...base, status: 'fail', reason: run.reason };
  }
  if (sameBehaviour(expected, run.output)) {
    return { ...base, status: 'pass', expected, actual: run.output };
  }
  return {
    ...base,
    status: 'fail',
    reason: `output differs from node:\n${diffOutputs(expected, run.output, target)}`,
    expected,
    actual: run.output,
  };
}

/** Runs the conformance corpus (ADR 0004) and checks the results against `expectations.json`. */
export async function runConformance(
  options: ConformanceOptions = {},
): Promise<ConformanceReport> {
  const repoRoot = options.repoRoot ?? findRepoRoot();
  const conformanceDir = path.join(repoRoot, 'conformance');
  const casesDir = options.casesDir ?? path.join(conformanceDir, 'cases');
  const expectationsFile =
    options.expectationsFile ?? path.join(conformanceDir, 'expectations.json');
  const tsconfigPath =
    options.tsconfigPath ?? path.join(conformanceDir, 'tsconfig.base.json');
  const workDir = options.workDir ?? path.join(repoRoot, '.conformance');
  const runtimeDir = options.runtimeDir ?? path.join(repoRoot, 'runtime');
  const targets = options.targets ?? [...ALL_TARGETS];
  const concurrency = options.concurrency ?? 4;
  const runTimeoutMs = options.runTimeoutMs ?? 30_000;
  const buildTimeoutMs = options.buildTimeoutMs ?? 30 * 60_000;
  const log = options.log ?? ((line: string) => console.log(line));

  const cases = discoverCases(casesDir, options.filter);
  const expectations = readExpectations(expectationsFile);
  if (!options.filter) {
    const known = new Set(cases.map((c) => c.id));
    Object.keys(expectations)
      .filter((id) => !known.has(id))
      .forEach((id) =>
        log(`warning: expectations.json lists unknown case ${id}`),
      );
  }
  log(`conformance: ${cases.length} case(s) on ${targets.join(', ')}`);

  fs.rmSync(workDir, { recursive: true, force: true });
  fs.mkdirSync(workDir, { recursive: true });
  try {
    const compilerOptions = readCompilerOptions(tsconfigPath);
    const baseline = await runNodeBaseline({
      cases,
      casesDir,
      compilerOptions,
      outDir: path.join(workDir, 'node'),
      timeoutMs: runTimeoutMs,
      concurrency,
    });
    const converter =
      options.converter ?? compileProjectConverter(compilerOptions);
    const toConvert = cases.filter((c) =>
      c.targets.some((t) => targets.includes(t)),
    );
    const conversions = await convertAll(
      toConvert,
      converter,
      path.join(workDir, 'hx'),
      concurrency,
    );
    const classPaths = new Map<string, string>();
    for (const [id, conversion] of conversions) {
      if (conversion.ok) {
        classPaths.set(id, conversion.classPath);
      }
    }

    const env = toolEnv(repoRoot);
    const results: CaseResult[] = [];
    for (const target of targets) {
      const runnable = toConvert.filter(
        (c) => c.targets.includes(target) && classPaths.has(c.id),
      );
      const ctx: TargetContext = {
        repoRoot,
        runtimeDir: fs.existsSync(runtimeDir) ? runtimeDir : undefined,
        classPaths,
        targetDir: path.join(workDir, target),
        env,
        buildTimeoutMs,
        runTimeoutMs,
        concurrency,
      };
      fs.mkdirSync(ctx.targetDir, { recursive: true });
      const runs =
        runnable.length > 0
          ? await TARGET_RUNNERS[target](runnable, ctx)
          : new Map<string, TargetRun>();
      for (const c of cases) {
        const conversion = conversions.get(c.id) ?? {
          ok: false,
          reason: 'not converted',
        };
        results.push(
          resultOf(c, target, baseline.get(c.id)!, conversion, runs.get(c.id)),
        );
      }
    }

    const evaluated = evaluate(expectations, results);
    evaluated.forEach((r) => log(formatResult(r)));
    log(`conformance: ${formatSummary(evaluated)}`);
    const unexpected = evaluated.filter((r) => isUnexpected(r.outcome));
    if (options.updateExpectations) {
      writeExpectations(
        expectationsFile,
        updateExpectations(expectations, results),
      );
      log(`conformance: updated ${path.relative(repoRoot, expectationsFile)}`);
      return { results: evaluated, ok: true };
    }
    if (unexpected.length > 0) {
      log(
        `conformance: ${unexpected.length} unexpected result(s). Fix them, or run with --update-expectations to record them.`,
      );
    }
    return { results: evaluated, ok: unexpected.length === 0 };
  } finally {
    if (!options.keep) {
      fs.rmSync(workDir, { recursive: true, force: true });
    }
  }
}
