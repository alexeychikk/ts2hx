import {
  BOOL,
  constExpr,
  INT,
  localExpr,
  sameType,
  VOID,
} from '../ir/builders';
import type {
  HxExpr,
  HxFunction,
  HxModule,
  HxPass,
  HxStmt,
  HxType,
  PassContext,
} from '../ir/types';
import { transformModule } from '../ir/walk';

type JumpKind = 'break' | 'continue';
type TsSwitch = Extract<HxStmt, { kind: 'tsSwitch' }>;
type Loop = Extract<HxStmt, { kind: 'while' | 'forIn' | 'cFor' }>;

/** What a `break`/`continue` can target: a loop, a `switch` or a labelled statement. */
interface Scope {
  kind: 'loop' | 'switch' | 'labeled';
  labels: ReadonlySet<string>;
  /** Whether the scope is printed as a Haxe loop, which Haxe's `break`/`continue` reach. */
  haxeLoop: boolean;
  /** Flags of the jumps to this scope that cross nested Haxe loops. */
  flags: Map<JumpKind, string>;
  /** Flag checks to run right after this scope's Haxe loop, by flag. */
  exitChecks: Map<string, HxStmt>;
}

/** Which jumps of a body belong to a scope. */
interface Owner {
  labels: ReadonlySet<string>;
  plainBreak: boolean;
  plainContinue: boolean;
}

const NO_LABELS: ReadonlySet<string> = new Set();

function isLoop(stmt: HxStmt): stmt is Loop {
  return stmt.kind === 'while' || stmt.kind === 'forIn' || stmt.kind === 'cFor';
}

/** Whether `stmts` contain a jump `owner` receives (functions own theirs). */
export function hasJumpTo(stmts: HxStmt[], owner: Owner): boolean {
  return stmts.some((stmt): boolean => {
    switch (stmt.kind) {
      case 'break':
        return owner.plainBreak;
      case 'continue':
        return owner.plainContinue;
      case 'labeledBreak':
      case 'labeledContinue':
        return owner.labels.has(stmt.label);
      case 'block':
        return hasJumpTo(stmt.body, owner);
      case 'if':
        return hasJumpTo(stmt.then, owner) || hasJumpTo(stmt.else ?? [], owner);
      case 'switch':
        return (
          stmt.cases.some((c) => hasJumpTo(c.body, owner)) ||
          hasJumpTo(stmt.default ?? [], owner)
        );
      case 'try':
        return (
          hasJumpTo(stmt.body, owner) ||
          stmt.catches.some((c) => hasJumpTo(c.body, owner))
        );
      case 'tryFinally':
        return (
          hasJumpTo(stmt.body, owner) ||
          hasJumpTo(stmt.catch?.body ?? [], owner) ||
          hasJumpTo(stmt.finally, owner)
        );
      case 'labeled':
        return hasJumpTo([stmt.body], owner);
      case 'while':
      case 'forIn':
      case 'cFor':
        return hasJumpTo(stmt.body, {
          labels: owner.labels,
          plainBreak: false,
          plainContinue: false,
        });
      case 'tsSwitch':
        return stmt.clauses.some((c) =>
          hasJumpTo(c.body, { ...owner, plainBreak: false }),
        );
      default:
        return false;
    }
  });
}

/** Whether control never runs past the end of `stmts`. */
export function exits(stmts: HxStmt[]): boolean {
  const last = stmts[stmts.length - 1];
  if (!last) return false;
  switch (last.kind) {
    case 'return':
    case 'throw':
    case 'break':
    case 'continue':
    case 'labeledBreak':
    case 'labeledContinue':
      return true;
    case 'block':
      return exits(last.body);
    case 'if':
      return last.else !== undefined && exits(last.then) && exits(last.else);
    default:
      return false;
  }
}

/** Drops a `break` of the switch that ends `stmts`, possibly inside trailing blocks. */
function stripTrailingBreak(
  stmts: HxStmt[],
  labels: ReadonlySet<string>,
): { body: HxStmt[]; stripped: boolean } {
  const last = stmts[stmts.length - 1];
  if (
    last?.kind === 'break' ||
    (last?.kind === 'labeledBreak' && labels.has(last.label))
  ) {
    return { body: stmts.slice(0, -1), stripped: true };
  }
  if (last?.kind === 'block') {
    const inner = stripTrailingBreak(last.body, labels);
    return {
      body: [...stmts.slice(0, -1), { ...last, body: inner.body }],
      stripped: inner.stripped,
    };
  }
  return { body: stmts, stripped: false };
}

/** Expressions whose evaluation has no side effect, so skipping it is unobservable. */
function isSideEffectFree(expr: HxExpr): boolean {
  switch (expr.kind) {
    case 'const':
    case 'local':
    case 'this':
    case 'staticField':
    case 'moduleField':
    case 'typeRef':
      return true;
    case 'field':
      return isSideEffectFree(expr.target);
    case 'binop':
      return isSideEffectFree(expr.left) && isSideEffectFree(expr.right);
    case 'unop':
      return (
        expr.op !== '++' && expr.op !== '--' && isSideEffectFree(expr.operand)
      );
    case 'cast':
      return !expr.checked && isSideEffectFree(expr.expr);
    default:
      return false;
  }
}

/** Clauses that share a body: empty clauses fall into the next one. */
interface ClauseGroup {
  tests: HxExpr[];
  hasDefault: boolean;
  body: HxStmt[];
}

function groupClauses(clauses: TsSwitch['clauses']): ClauseGroup[] {
  const groups: ClauseGroup[] = [];
  let pending: ClauseGroup = { tests: [], hasDefault: false, body: [] };
  for (const clause of clauses) {
    if (clause.test) pending.tests.push(clause.test);
    else pending.hasDefault = true;
    if (clause.body.length > 0) {
      groups.push({ ...pending, body: clause.body });
      pending = { tests: [], hasDefault: false, body: [] };
    }
  }
  if (pending.tests.length > 0 || pending.hasDefault) groups.push(pending);
  return groups;
}

function anyOf(tests: HxExpr[]): HxExpr {
  return tests.reduce((left, right) => ({
    kind: 'binop',
    op: '||',
    left,
    right,
    type: BOOL,
  }));
}

function intConst(value: number): HxExpr {
  return { kind: 'const', value, int: true, type: INT };
}

function flagSet(flag: string, value: boolean): HxStmt {
  return {
    kind: 'expr',
    expr: {
      kind: 'assign',
      op: '=',
      target: localExpr(flag, BOOL),
      value: constExpr(value),
      type: BOOL,
    },
  };
}

function doWhileFalse(body: HxStmt[]): HxStmt {
  return { kind: 'while', cond: constExpr(false), body, doWhile: true };
}

class Lowerer {
  private readonly scopes: Scope[] = [];
  private lowered = false;

  constructor(private readonly context: PassContext) {}

  /** Lowers a function body; a value-returning one Haxe may see falling off its end gets a terminator. */
  body(stmts: HxStmt[], ret: HxType): HxStmt[] {
    const result = this.stmts(stmts);
    return this.lowered && !sameType(ret, VOID) && !exits(result)
      ? [...result, { kind: 'throw', value: constExpr('unreachable') }]
      : result;
  }

  private stmts(stmts: HxStmt[]): HxStmt[] {
    return stmts.flatMap((stmt) => this.stmt(stmt));
  }

  private stmt(stmt: HxStmt): HxStmt[] {
    switch (stmt.kind) {
      case 'block':
        return [{ ...stmt, body: this.stmts(stmt.body) }];
      case 'if':
        return [
          {
            ...stmt,
            then: this.stmts(stmt.then),
            else: stmt.else && this.stmts(stmt.else),
          },
        ];
      case 'switch':
        return [
          {
            ...stmt,
            cases: stmt.cases.map((c) => ({ ...c, body: this.stmts(c.body) })),
            default: stmt.default && this.stmts(stmt.default),
          },
        ];
      case 'try':
        return [
          {
            ...stmt,
            body: this.stmts(stmt.body),
            catches: stmt.catches.map((c) => ({
              ...c,
              body: this.stmts(c.body),
            })),
          },
        ];
      case 'tryFinally':
        return [
          {
            ...stmt,
            body: this.stmts(stmt.body),
            catch: stmt.catch && {
              ...stmt.catch,
              body: this.stmts(stmt.catch.body),
            },
            finally: this.stmts(stmt.finally),
          },
        ];
      case 'localFunction':
        return [{ ...stmt, fn: lowerFunction(stmt.fn, this.context) }];
      case 'while':
      case 'forIn':
      case 'cFor':
        return this.loop(stmt, NO_LABELS);
      case 'labeled':
        return this.labeled(stmt, new Set());
      case 'tsSwitch':
        return this.tsSwitch(stmt, NO_LABELS);
      case 'break':
      case 'continue':
        return this.jump(stmt.kind);
      case 'labeledBreak':
        return this.jump('break', stmt.label);
      case 'labeledContinue':
        return this.jump('continue', stmt.label);
      default:
        return [stmt];
    }
  }

  private labeled(
    stmt: Extract<HxStmt, { kind: 'labeled' }>,
    outer: Set<string>,
  ): HxStmt[] {
    this.lowered = true;
    const labels = new Set([...outer, stmt.label]);
    const { body } = stmt;
    if (body.kind === 'labeled') return this.labeled(body, labels);
    if (isLoop(body)) return this.loop(body, labels);
    if (body.kind === 'tsSwitch') return this.tsSwitch(body, labels);
    const wrapped = hasJumpTo([body], {
      labels,
      plainBreak: false,
      plainContinue: false,
    });
    return this.scoped('labeled', labels, wrapped, () => this.stmt(body));
  }

  private loop(stmt: Loop, labels: ReadonlySet<string>): HxStmt[] {
    return this.scoped('loop', labels, false, () => [
      { ...stmt, body: this.stmts(stmt.body) },
    ]);
  }

  /**
   * A JS `switch` as an if-chain when no clause falls into the next one, else
   * as a clause index whose bodies run from the matched one on. `break`s that
   * remain become `break`s of a `do {} while (false)` wrapper.
   */
  private tsSwitch(stmt: TsSwitch, labels: ReadonlySet<string>): HxStmt[] {
    this.lowered = true;
    const groups = groupClauses(stmt.clauses);
    const stripped = groups.map((g) => stripTrailingBreak(g.body, labels));
    const defaultGroup = groups.find((g) => g.hasDefault);
    const asIfChain =
      stripped.every(
        (s, i) => i === groups.length - 1 || s.stripped || exits(s.body),
      ) &&
      (defaultGroup?.tests.every(isSideEffectFree) ?? true);
    const bodies = asIfChain
      ? stripped.map((s) => s.body)
      : groups.map((g) => g.body);
    const wrapped = hasJumpTo(bodies.flat(), {
      labels,
      plainBreak: true,
      plainContinue: false,
    });
    const subject: HxStmt[] = stmt.subject
      ? [
          {
            kind: 'var',
            name: stmt.subject.name,
            final: true,
            type: stmt.subject.value.type,
            init: stmt.subject.value,
          },
        ]
      : [];
    const lowered = this.scoped('switch', labels, wrapped, () => {
      const loweredBodies = bodies.map((b) => this.stmts(b));
      return asIfChain
        ? this.ifChain(groups, loweredBodies)
        : this.fallThrough(groups, loweredBodies);
    });
    return [{ kind: 'block', body: [...subject, ...lowered] }];
  }

  private ifChain(groups: ClauseGroup[], bodies: HxStmt[][]): HxStmt[] {
    const defaultIndex = groups.findIndex((g) => g.hasDefault);
    const chain = groups
      .map((group, i) => ({ group, body: bodies[i] }))
      .filter((_, i) => i !== defaultIndex);
    return chain.reduceRight<HxStmt[]>(
      (otherwise, { group, body }) => [
        {
          kind: 'if',
          cond: anyOf(group.tests),
          then: body,
          else: otherwise.length > 0 ? otherwise : undefined,
        },
      ],
      defaultIndex >= 0 ? bodies[defaultIndex] : [],
    );
  }

  private fallThrough(groups: ClauseGroup[], bodies: HxStmt[][]): HxStmt[] {
    const name = this.context.freshName('case');
    const defaultIndex = groups.findIndex((g) => g.hasDefault);
    const tests = groups.flatMap((group, i) =>
      group.tests.map((test) => ({ test, i })),
    );
    const index = tests.reduceRight<HxExpr>(
      (otherwise, { test, i }) => ({
        kind: 'ternary',
        cond: test,
        then: intConst(i),
        else: otherwise,
        type: INT,
      }),
      intConst(defaultIndex >= 0 ? defaultIndex : groups.length),
    );
    const matched = localExpr(name, INT);
    return [
      { kind: 'var', name, final: true, type: INT, init: index },
      ...bodies.flatMap((body, i): HxStmt[] =>
        body.length === 0
          ? []
          : [
              {
                kind: 'if',
                cond: {
                  kind: 'binop',
                  op: '<=',
                  left: matched,
                  right: intConst(i),
                  type: BOOL,
                },
                then: body,
              },
            ],
      ),
    ];
  }

  /**
   * Lowers `build()` inside a new scope. A scope that is not a loop itself is
   * wrapped in `do {} while (false)` when `wrapped`. Flags of jumps to the
   * scope are declared before it; checks of jumps across it follow it.
   */
  private scoped(
    kind: Scope['kind'],
    labels: ReadonlySet<string>,
    wrapped: boolean,
    build: () => HxStmt[],
  ): HxStmt[] {
    const scope: Scope = {
      kind,
      labels,
      haxeLoop: kind === 'loop' || wrapped,
      flags: new Map(),
      exitChecks: new Map(),
    };
    this.scopes.push(scope);
    const body = build();
    this.scopes.pop();
    const flags: HxStmt[] = [...scope.flags.values()].map((name) => ({
      kind: 'var',
      name,
      final: false,
      type: BOOL,
      init: constExpr(false),
    }));
    const main = kind !== 'loop' && wrapped ? [doWhileFalse(body)] : body;
    return [...flags, ...main, ...scope.exitChecks.values()];
  }

  private targetIndex(kind: JumpKind, label?: string): number {
    for (let i = this.scopes.length - 1; i >= 0; i--) {
      const scope = this.scopes[i];
      const matches =
        label !== undefined
          ? scope.labels.has(label)
          : kind === 'break'
            ? scope.kind !== 'labeled'
            : scope.kind === 'loop';
      if (matches) return i;
    }
    return -1;
  }

  /**
   * A jump to the innermost Haxe loop stays a jump. One that crosses Haxe
   * loops sets a flag and breaks; each crossed loop is followed by a check
   * that breaks again, or performs the jump once the target is reached.
   */
  private jump(kind: JumpKind, label?: string): HxStmt[] {
    const index = this.targetIndex(kind, label);
    const target = this.scopes[index];
    if (!target || (kind === 'continue' && target.kind !== 'loop')) {
      const message = `${kind} ${label ?? ''} without a target`.trim();
      this.context.reportUnsupported(message);
      return [
        {
          kind: 'expr',
          expr: {
            kind: 'unsupported',
            message,
            source: '',
            type: VOID,
          },
        },
      ];
    }
    const crossed = this.scopes.slice(index + 1).filter((s) => s.haxeLoop);
    if (crossed.length === 0) {
      return [{ kind }];
    }
    let flag = target.flags.get(kind);
    if (!flag) {
      flag = this.context.freshName(kind);
      target.flags.set(kind, flag);
    }
    crossed.forEach((scope, i) => {
      const atTarget = i === 0;
      scope.exitChecks.set(flag, {
        kind: 'if',
        cond: localExpr(flag, BOOL),
        then:
          atTarget && kind === 'continue'
            ? [flagSet(flag, false), { kind: 'continue' }]
            : [{ kind: 'break' }],
      });
    });
    return [flagSet(flag, true), { kind: 'break' }];
  }
}

function lowerFunction(fn: HxFunction, context: PassContext): HxFunction {
  return fn.body
    ? { ...fn, body: new Lowerer(context).body(fn.body, fn.ret) }
    : fn;
}

/**
 * Lowers JS control flow Haxe lacks (ADR 0005): `switch` with fall-through,
 * non-constant cases and `break`, labelled statements, and `break`/`continue`
 * that cross loops. Runs before `lowerCFor`, which still sees its `cFor`s.
 */
export const lowerControlFlow: HxPass = (module: HxModule, context) => {
  const nested = transformModuleExprs(module, context);
  return {
    ...nested,
    decls: nested.decls.map((decl) => {
      switch (decl.kind) {
        case 'moduleFunction':
          return { ...decl, fn: lowerFunction(decl.fn, context) };
        case 'class':
          return {
            ...decl,
            fields: decl.fields.map((field) =>
              field.kind === 'method'
                ? { ...field, fn: lowerFunction(field.fn, context) }
                : field,
            ),
          };
        default:
          return decl;
      }
    }),
    init: new Lowerer(context).body(nested.init, VOID),
  };
};

/** Lowers the bodies of function expressions, innermost first. */
function transformModuleExprs(
  module: HxModule,
  context: PassContext,
): HxModule {
  return transformModule(module, {
    expr: (expr) =>
      expr.kind === 'fn'
        ? { ...expr, fn: lowerFunction(expr.fn, context) }
        : expr,
  });
}
