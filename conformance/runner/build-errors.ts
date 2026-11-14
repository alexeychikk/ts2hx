import type { ConformanceCase } from './types';

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Matches the case's package as a path (`cases/basics/hello/`) or a dotted name (`cases.basics.hello.Main`). */
export function casePattern(rootPackage: string): RegExp {
  const segments = rootPackage.split('.').map(escapeRegExp);
  return new RegExp(`${segments.join('[/\\\\.]')}(?![A-Za-z0-9_])`);
}

function isErrorLine(line: string): boolean {
  const mentionsError = /\berror\b/i.test(line);
  if (/\bwarning\b/i.test(line) && !mentionsError) {
    return false;
  }
  return mentionsError || /\.hx:\d+: (characters|lines) /.test(line);
}

/**
 * Maps Haxe, C# and C++ compiler output back to the cases whose files it names.
 * Returns each culprit case with the error lines that mention it.
 */
export function attributeBuildErrors(
  output: string,
  cases: readonly ConformanceCase[],
): Map<string, string[]> {
  const patterns = cases.map((c) => ({
    id: c.id,
    pattern: casePattern(c.rootPackage),
  }));
  const culprits = new Map<string, string[]>();
  for (const line of output.split(/\r?\n/)) {
    if (!line.trim() || !isErrorLine(line)) {
      continue;
    }
    for (const { id, pattern } of patterns) {
      if (pattern.test(line)) {
        const lines = culprits.get(id) ?? [];
        if (lines.length < 10 && !lines.includes(line.trim())) {
          lines.push(line.trim());
        }
        culprits.set(id, lines);
      }
    }
  }
  return culprits;
}
