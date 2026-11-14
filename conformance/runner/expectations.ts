import * as fs from 'node:fs';

import {
  ALL_TARGETS,
  type CaseResult,
  type EvaluatedResult,
  type Expectations,
  type Outcome,
  type ProgramOutput,
} from './types';

export function normalizeOutput(text: string): string {
  return text.replace(/\r\n?/g, '\n').replace(/\n$/, '');
}

export function sameBehaviour(
  expected: ProgramOutput,
  actual: ProgramOutput,
): boolean {
  return (
    !actual.timedOut &&
    expected.exitCode === actual.exitCode &&
    normalizeOutput(expected.stdout) === normalizeOutput(actual.stdout)
  );
}

export function readExpectations(file: string): Expectations {
  if (!fs.existsSync(file)) {
    return {};
  }
  return JSON.parse(fs.readFileSync(file, 'utf8')) as Expectations;
}

export function isExpectedToFail(
  expectations: Expectations,
  result: CaseResult,
): boolean {
  return expectations[result.caseId]?.[result.target] === 'fail';
}

export function outcomeOf(
  expectations: Expectations,
  result: CaseResult,
): Outcome {
  if (result.status === 'skip') {
    return 'SKIP';
  }
  const expectedFail = isExpectedToFail(expectations, result);
  if (result.status === 'pass') {
    return expectedFail ? 'XPASS' : 'PASS';
  }
  return expectedFail ? 'XFAIL' : 'FAIL';
}

export function evaluate(
  expectations: Expectations,
  results: CaseResult[],
): EvaluatedResult[] {
  return results.map((r) => ({ ...r, outcome: outcomeOf(expectations, r) }));
}

/** An unexpected failure or an unexpected pass fails the run. */
export function isUnexpected(outcome: Outcome): boolean {
  return outcome === 'FAIL' || outcome === 'XPASS';
}

/** Records the observed results for the case/target pairs that ran; other entries are kept. */
export function updateExpectations(
  expectations: Expectations,
  results: CaseResult[],
): Expectations {
  const next: Expectations = structuredClone(expectations);
  for (const result of results) {
    if (result.status === 'skip') {
      continue;
    }
    const entry = (next[result.caseId] ??= {});
    if (result.status === 'fail') {
      entry[result.target] = 'fail';
    } else {
      delete entry[result.target];
    }
  }
  const sorted: Expectations = {};
  for (const id of Object.keys(next).sort()) {
    const entry = next[id];
    const targets = ALL_TARGETS.filter((t) => entry[t] === 'fail');
    if (targets.length > 0) {
      sorted[id] = Object.fromEntries(targets.map((t) => [t, 'fail']));
    }
  }
  return sorted;
}

export function writeExpectations(
  file: string,
  expectations: Expectations,
): void {
  fs.writeFileSync(file, `${JSON.stringify(expectations, null, 2)}\n`);
}
