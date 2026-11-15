import { countNodes, NodeType, Program } from './ast';
import { installBuiltins } from './builtins';
import { formatPos, LangError } from './errors';
import { Interpreter, ThrownValue } from './interpreter';
import { Token, TokenKind, tokenize } from './lexer';
import { Parser } from './parser';
import { err, mapResult, ok, Result, unwrapOr } from './util/result';
import { Stack } from './util/stack';
import { padRight } from './util/strings';
import { show } from './values';

export type RunStatus = 'ok' | 'compile-error' | 'runtime-error' | 'thrown';

export interface RunReport {
  name: string;
  status: RunStatus;
  output: string[];
  result: string;
  steps: number;
  deferredRan: number;
}

const PAIRS: Record<string, string> = { ')': '(', ']': '[', '}': '{' };

export function checkBalanced(tokens: Token[]): Result<number, string> {
  const open = new Stack<Token>();
  let deepest = 0;
  for (const token of tokens) {
    if (token.kind !== TokenKind.Punct) continue;
    if ('([{'.includes(token.text)) {
      deepest = Math.max(deepest, open.push(token).size);
    } else if (token.text in PAIRS) {
      const top = open.peek();
      if (top === undefined || top.text !== PAIRS[token.text]) {
        return err(`unmatched '${token.text}' at ${formatPos(token.pos)}`);
      }
      open.pop();
    }
  }
  if (!open.isEmpty()) {
    const unclosed = open.toArray().map((token) => token.text);
    return err(`unclosed ${unclosed.join('')}`);
  }
  return ok(deepest);
}

export function compile(source: string): Result<Program, LangError> {
  try {
    return ok(Parser.parse(source));
  } catch (e) {
    if (e instanceof LangError) return err(e);
    throw e;
  }
}

export function delay(ms: number): Promise<void> {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

export class Session {
  private static created = 0;
  readonly id: number;
  readonly log: string[] = [];

  constructor(
    readonly name: string,
    readonly source: string,
  ) {
    this.id = ++Session.created;
  }

  nestingDepth(): number {
    try {
      return unwrapOr(checkBalanced(tokenize(this.source)), -1);
    } catch {
      return -1;
    }
  }

  nodeSummary(limit: number): string {
    const compiled = mapResult(compile(this.source), (program) =>
      countNodes(program),
    );
    if (!compiled.ok) return 'n/a';
    const entries: Array<[NodeType, number]> = [...compiled.value.entries()];
    entries.sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
    return entries
      .slice(0, limit)
      .map(([type, count]) => `${type}=${count}`)
      .join(' ');
  }

  async run(): Promise<RunReport> {
    await delay(0);
    const output: string[] = [];
    const interpreter = new Interpreter({
      maxDepth: 40,
      maxSteps: 200_000,
      print: (line) => output.push(line),
    });
    installBuiltins(interpreter);
    const report = (
      status: RunStatus,
      result: string,
      deferredRan = 0,
    ): RunReport => ({
      name: this.name,
      status,
      output,
      result,
      steps: interpreter.stepCount,
      deferredRan,
    });

    const compiled = compile(this.source);
    if (!compiled.ok) {
      return report('compile-error', compiled.error.message);
    }
    try {
      const value = interpreter.run(compiled.value);
      let ran = 0;
      const jobs = interpreter.deferred
        .slice()
        .sort((a, b) => a.delay - b.delay);
      for (const job of jobs) {
        await delay(job.delay);
        interpreter.call(job.callback, [], { line: 0, col: 0 });
        ran++;
      }
      return report('ok', show(value, true), ran);
    } catch (e) {
      if (e instanceof ThrownValue) {
        return report(
          'thrown',
          `${show(e.value, true)} at ${formatPos(e.pos)}`,
        );
      }
      if (e instanceof LangError) {
        const trace = 'trace' in e ? (e as { trace: string[] }).trace : [];
        const suffix = trace.length > 0 ? ` [${trace.join(' < ')}]` : '';
        return report('runtime-error', e.message + suffix);
      }
      throw e;
    }
  }
}

export async function* runSequentially(
  sessions: Session[],
): AsyncGenerator<RunReport> {
  for (const session of sessions) {
    yield await session.run();
  }
}

export function formatReport(report: RunReport): string {
  const lines = [
    `== ${padRight(report.name, 14)} ${report.status} (${report.steps} steps)`,
  ];
  for (const line of report.output) {
    lines.push(`  | ${line}`);
  }
  if (report.deferredRan > 0) {
    lines.push(`  deferred: ${report.deferredRan}`);
  }
  lines.push(`  => ${report.result}`);
  return lines.join('\n');
}
