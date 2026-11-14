import type { HxExpr, HxPass, HxStmt, PassContext } from '../ir/types';
import { transformExpr, transformModule } from '../ir/walk';

type CFor = Extract<HxStmt, { kind: 'cFor' }>;

/**
 * Replaces the `continue`s that belong to the current loop. Nested loops own
 * theirs, and functions cannot continue an enclosing loop.
 */
export function replaceOwnContinues(
  stmts: HxStmt[],
  replacement: () => HxStmt[],
): HxStmt[] {
  const recurse = (body: HxStmt[]) => replaceOwnContinues(body, replacement);
  return stmts.flatMap((stmt): HxStmt[] => {
    switch (stmt.kind) {
      case 'continue':
        return [...replacement(), stmt];
      case 'block':
        return [{ ...stmt, body: recurse(stmt.body) }];
      case 'if':
        return [
          {
            ...stmt,
            then: recurse(stmt.then),
            else: stmt.else && recurse(stmt.else),
          },
        ];
      case 'switch':
        return [
          {
            ...stmt,
            cases: stmt.cases.map((c) => ({ ...c, body: recurse(c.body) })),
            default: stmt.default && recurse(stmt.default),
          },
        ];
      case 'try':
        return [
          {
            ...stmt,
            body: recurse(stmt.body),
            catches: stmt.catches.map((c) => ({ ...c, body: recurse(c.body) })),
          },
        ];
      case 'tsSwitch':
        return [
          {
            ...stmt,
            clauses: stmt.clauses.map((c) => ({ ...c, body: recurse(c.body) })),
          },
        ];
      case 'tryFinally':
        return [
          {
            ...stmt,
            body: recurse(stmt.body),
            catch: stmt.catch && {
              ...stmt.catch,
              body: recurse(stmt.catch.body),
            },
            finally: recurse(stmt.finally),
          },
        ];
      case 'labeled': {
        const [body] = recurse([stmt.body]);
        return [{ ...stmt, body }];
      }
      default:
        return [stmt];
    }
  });
}

function renameLocals(
  expr: HxExpr,
  renames: ReadonlyMap<string, string>,
): HxExpr {
  return transformExpr(expr, {
    expr: (e) =>
      e.kind === 'local' && renames.has(e.name)
        ? { ...e, name: renames.get(e.name)! }
        : e,
  });
}

function exprStmts(exprs: HxExpr[]): HxStmt[] {
  return exprs.map((expr) => ({ kind: 'expr', expr }));
}

const TRUE: HxExpr = {
  kind: 'const',
  value: true,
  type: {
    kind: 'path',
    path: { pack: [], module: 'Bool', name: 'Bool' },
    params: [],
  },
};

function negate(cond: HxExpr): HxExpr {
  return {
    kind: 'unop',
    op: '!',
    postfix: false,
    operand: cond,
    type: cond.type,
  };
}

/** `for (init; cond; update) body` as `{ init; while (cond) { body; update } }`, `continue` running the update. */
function lowerSimple(loop: CFor): HxStmt {
  const body = replaceOwnContinues(loop.body, () => exprStmts(loop.update));
  return {
    kind: 'block',
    body: [
      ...loop.init,
      {
        kind: 'while',
        cond: loop.cond ?? TRUE,
        body: [...body, ...exprStmts(loop.update)],
        doWhile: false,
      },
    ],
  };
}

/**
 * Loop `let`s captured by closures get JS per-iteration copies: the loop keeps
 * each binding in an outer variable and every iteration declares a fresh copy,
 * which is written back before the update runs on the outer one.
 */
function lowerPerIteration(loop: CFor, context: PassContext): HxStmt {
  const captured = new Set(loop.perIterationBindings);
  const renames = new Map(
    loop.perIterationBindings.map((name) => [name, context.freshName(name)]),
  );
  const copies: HxStmt[] = [];
  const init = loop.init.map((stmt): HxStmt => {
    if (stmt.kind === 'var' && captured.has(stmt.name)) {
      copies.push({
        kind: 'var',
        name: stmt.name,
        final: false,
        type: stmt.type,
        init: {
          kind: 'local',
          name: renames.get(stmt.name)!,
          type: stmt.type ?? { kind: 'dynamic' },
        },
      });
      return {
        ...stmt,
        name: renames.get(stmt.name)!,
        final: false,
        init: stmt.init && renameLocals(stmt.init, renames),
      };
    }
    if (stmt.kind === 'var' && stmt.init) {
      return { ...stmt, init: renameLocals(stmt.init, renames) };
    }
    if (stmt.kind === 'expr') {
      return { ...stmt, expr: renameLocals(stmt.expr, renames) };
    }
    return stmt;
  });
  const writeBack: HxStmt[] = [...renames].map(([name, outer]) => ({
    kind: 'expr',
    expr: {
      kind: 'assign',
      op: '=',
      target: { kind: 'local', name: outer, type: { kind: 'dynamic' } },
      value: { kind: 'local', name, type: { kind: 'dynamic' } },
      type: { kind: 'dynamic' },
    },
  }));
  const update = exprStmts(loop.update.map((u) => renameLocals(u, renames)));
  const exit: HxStmt[] = loop.cond
    ? [{ kind: 'if', cond: negate(loop.cond), then: [{ kind: 'break' }] }]
    : [];
  const body = replaceOwnContinues(loop.body, () => [...writeBack, ...update]);
  return {
    kind: 'block',
    body: [
      ...init,
      {
        kind: 'while',
        cond: TRUE,
        body: [...copies, ...exit, ...body, ...writeBack, ...update],
        doWhile: false,
      },
    ],
  };
}

/** Lowers C-style `for` loops into `while` loops (ADR 0005). */
export const lowerCFor: HxPass = (module, context) =>
  transformModule(module, {
    stmts: (stmts) =>
      stmts.map((stmt) =>
        stmt.kind !== 'cFor'
          ? stmt
          : stmt.perIterationBindings.length > 0
            ? lowerPerIteration(stmt, context)
            : lowerSimple(stmt),
      ),
  });
