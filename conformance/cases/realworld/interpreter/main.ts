import { formatPos } from './errors';
import { Formatter } from './formatter';
import { checkBalanced, formatReport, runSequentially, Session } from './host';
import { TokenKind, tokenize } from './lexer';
import { Parser } from './parser';
import { SCRIPTS } from './scripts';

function lexerDemo(): void {
  const tokens = tokenize('let total = price * (1 + rate) .. "%"; # comment');
  const summary = tokens.map(
    (token) => `${token.kind}:${token.text}@${formatPos(token.pos)}`,
  );
  console.log(summary.join(' '));
  const byKind = new Map<TokenKind, number>();
  for (const token of tokens) {
    byKind.set(token.kind, (byKind.get(token.kind) ?? 0) + 1);
  }
  console.log(byKind);
  for (const source of ['f(a[1], {k: [2]})', 'f(a[1)', 'g((x)']) {
    const balance = checkBalanced(tokenize(source));
    console.log(
      source,
      '->',
      balance.ok ? `depth ${balance.value}` : balance.error,
    );
  }
}

function formatterDemo(): void {
  const program = Parser.parse(`
fn classify(n) {
  if n < 0 { return "negative"; } else if n == 0 { return "zero"; } else { return "positive"; }
}
let xs = [1 + 2 * 3, (1 + 2) * 3, -(4 - 1), not true and false];
try { throw {code: 1}; } catch (e) { print(e.code .. "!"); }
for x in xs { if x > 5 { break; } }
let sq = fn(v) => v * v;
`);
  console.log(new Formatter().format(program.body));
}

async function main(): Promise<void> {
  lexerDemo();
  formatterDemo();

  const sessions = SCRIPTS.map(
    (script) => new Session(script.name, script.source),
  );
  console.log(
    sessions
      .map(
        (session) =>
          `${session.id}:${session.name}(depth ${session.nestingDepth()})`,
      )
      .join(' '),
  );
  console.log('nodes of recursion:', sessions[1].nodeSummary(5));

  const statuses = new Map<string, string[]>();
  for await (const report of runSequentially(sessions)) {
    console.log(formatReport(report));
    const names = statuses.get(report.status) ?? [];
    names.push(report.name);
    statuses.set(report.status, names);
  }
  console.log(statuses);

  const concurrent = await Promise.all(
    sessions.slice(0, 3).map(async (session, i) => {
      await Promise.resolve();
      const report = await session.run();
      return `${i}:${report.name}=${report.result}`;
    }),
  );
  console.log(concurrent.join(' | '));

  const failing = new Session('async-failure', 'print("hi"');
  await failing
    .run()
    .then((report) => {
      if (report.status !== 'ok')
        throw new Error(`session failed: ${report.result}`);
      return report;
    })
    .catch((e: unknown) => {
      console.log(
        'promise rejected:',
        e instanceof Error ? e.message : String(e),
      );
    })
    .finally(() => console.log('cleanup done'));
}

main().then(
  () => console.log('all done'),
  (e) => console.log('fatal', e),
);
