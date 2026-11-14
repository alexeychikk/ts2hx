import { normalizeOutput } from './expectations';
import type { EvaluatedResult, Outcome, ProgramOutput } from './types';

const MAX_DIFF_LINES = 20;

export function diffOutputs(
  expected: ProgramOutput,
  actual: ProgramOutput,
  target: string,
): string {
  const lines: string[] = [];
  if (actual.timedOut) {
    lines.push(`${target} timed out`);
  }
  if (expected.exitCode !== actual.exitCode) {
    lines.push(
      `exit code: node ${expected.exitCode}, ${target} ${actual.exitCode}`,
    );
  }
  const want = normalizeOutput(expected.stdout).split('\n');
  const got = normalizeOutput(actual.stdout).split('\n');
  let shown = 0;
  for (
    let i = 0;
    i < Math.max(want.length, got.length) && shown < MAX_DIFF_LINES;
    i++
  ) {
    if (want[i] !== got[i]) {
      lines.push(`line ${i + 1}:`);
      lines.push(`  - ${want[i] ?? '<missing>'}`);
      lines.push(`  + ${got[i] ?? '<missing>'}`);
      shown++;
    }
  }
  const stderr = actual.stderr.trim();
  if (stderr) {
    lines.push(
      `${target} stderr:`,
      ...stderr
        .split('\n')
        .slice(0, 10)
        .map((l) => `  ${l}`),
    );
  }
  return lines.join('\n');
}

function indent(text: string): string {
  return text
    .split('\n')
    .map((l) => `      ${l}`)
    .join('\n');
}

export function formatResult(result: EvaluatedResult): string {
  const head = `${result.outcome.padEnd(5)} ${result.target.padEnd(3)} ${result.caseId}`;
  const summary = result.reason?.split('\n')[0];
  if (result.outcome !== 'FAIL') {
    return summary && result.outcome !== 'PASS'
      ? `${head}  (${summary})`
      : head;
  }
  return `${head}\n${indent(result.reason ?? '')}`;
}

export function formatSummary(results: readonly EvaluatedResult[]): string {
  const counts = new Map<Outcome, number>();
  for (const r of results) {
    counts.set(r.outcome, (counts.get(r.outcome) ?? 0) + 1);
  }
  const order: Outcome[] = ['PASS', 'XFAIL', 'FAIL', 'XPASS', 'SKIP'];
  return order
    .filter((o) => counts.has(o))
    .map((o) => `${counts.get(o)} ${o}`)
    .join(', ');
}
