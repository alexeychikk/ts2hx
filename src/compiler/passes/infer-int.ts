import { FLOAT, INT, isFloatType, isIntType } from '../ir/builders';
import type {
  HxCatch,
  HxClassField,
  HxDecl,
  HxExpr,
  HxFunction,
  HxPass,
  HxStmt,
} from '../ir/types';

/** Closed integer interval; an infinite end is unbounded. */
export interface IntRange {
  lo: number;
  hi: number;
}

type CFor = Extract<HxStmt, { kind: 'cFor' }>;
type Env = ReadonlyMap<string, IntRange>;

const INT_MIN = -0x80000000;
const INT_MAX = 0x7fffffff;
const LENGTH_RANGE: IntRange = { lo: 0, hi: INT_MAX };
const COMPARISONS = new Set(['<', '<=', '>', '>=', '==', '!=']);

function isInt32(range: IntRange): boolean {
  return range.lo >= INT_MIN && range.hi <= INT_MAX;
}

function bounded(range: IntRange): IntRange | undefined {
  return isInt32(range) ? range : undefined;
}

function isStdInt(expr: HxExpr): expr is Extract<HxExpr, { kind: 'call' }> {
  return (
    expr.kind === 'call' &&
    expr.args.length === 1 &&
    expr.callee.kind === 'staticField' &&
    expr.callee.owner.pack.length === 0 &&
    expr.callee.owner.name === 'Std' &&
    expr.callee.name === 'int'
  );
}

function isNumeric(expr: HxExpr): boolean {
  return isFloatType(expr.type) || isIntType(expr.type);
}

/**
 * Integer range of a side-effect-free `number` expression whose JS value is
 * always an integer in that range (never `-0`, never fractional), or
 * `undefined` when that is not provable. Bounds may be infinite while
 * sub-expressions are combined; callers check they fit `Int`.
 */
function unboundedRange(expr: HxExpr, env: Env): IntRange | undefined {
  switch (expr.kind) {
    case 'const':
      return typeof expr.value === 'number' &&
        Number.isSafeInteger(expr.value) &&
        !Object.is(expr.value, -0)
        ? { lo: expr.value, hi: expr.value }
        : undefined;
    case 'local':
      return env.get(expr.name);
    case 'field':
      return expr.name === 'length' &&
        isIntType(expr.type) &&
        isSideEffectFree(expr.target)
        ? LENGTH_RANGE
        : undefined;
    case 'unop': {
      const operand =
        expr.op === '-' && isNumeric(expr)
          ? unboundedRange(expr.operand, env)
          : undefined;
      return operand && (operand.lo > 0 || operand.hi < 0)
        ? { lo: -operand.hi, hi: -operand.lo }
        : undefined;
    }
    case 'binop': {
      if (!isNumeric(expr)) return undefined;
      const left = unboundedRange(expr.left, env);
      const right = left && unboundedRange(expr.right, env);
      if (!left || !right) return undefined;
      switch (expr.op) {
        case '+':
          return { lo: left.lo + right.lo, hi: left.hi + right.hi };
        case '-':
          return { lo: left.lo - right.hi, hi: left.hi - right.lo };
        case '*':
          return left.lo >= 0 && right.lo >= 0
            ? { lo: left.lo * right.lo, hi: left.hi * right.hi }
            : undefined;
        case '%':
          return left.lo >= 0 && right.lo >= 1
            ? { lo: 0, hi: Math.min(left.hi, right.hi - 1) }
            : undefined;
        default:
          return undefined;
      }
    }
    default:
      return undefined;
  }
}

/** `unboundedRange` when it fits Haxe `Int` (32 bits on C# and C++). */
export function intRange(expr: HxExpr, env: Env): IntRange | undefined {
  const range = unboundedRange(expr, env);
  return range && bounded(range);
}

function isSideEffectFree(expr: HxExpr): boolean {
  switch (expr.kind) {
    case 'local':
    case 'this':
    case 'staticField':
    case 'moduleField':
      return true;
    case 'field':
      return isSideEffectFree(expr.target);
    default:
      return false;
  }
}

/** `expr`, proven by `intRange`, as `Int` arithmetic. */
function asInt(expr: HxExpr, env: Env): HxExpr {
  switch (expr.kind) {
    case 'const':
      return { ...expr, int: true, type: INT };
    case 'unop':
      return { ...expr, operand: asInt(expr.operand, env), type: INT };
    case 'binop':
      return {
        ...expr,
        left: asInt(expr.left, env),
        right: asInt(expr.right, env),
        type: INT,
      };
    default:
      return expr;
  }
}

/** Writes (`=`, `+=`, `++`, …) to the local `name` anywhere in `node`, nested functions included. */
function writesOf(node: unknown, name: string): HxExpr[] {
  const found: HxExpr[] = [];
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (value === null || typeof value !== 'object') return;
    const record = value as Record<string, unknown>;
    if (
      (record.kind === 'assign' && isLocal(record.target as HxExpr, name)) ||
      (record.kind === 'unop' &&
        (record.op === '++' || record.op === '--') &&
        isLocal(record.operand as HxExpr, name))
    ) {
      found.push(value as HxExpr);
    }
    Object.values(record).forEach(visit);
  };
  visit(node);
  return found;
}

function isLocal(expr: HxExpr, name: string): boolean {
  return expr.kind === 'local' && expr.name === name;
}

interface Step {
  direction: 1 | -1;
  /** Largest amount one update moves the counter by. */
  max: number;
}

/** The counter update `v++`, `v -= step`, … with a positive integral step. */
function counterStep(update: HxExpr, name: string, env: Env): Step | undefined {
  if (update.kind === 'unop') {
    return { direction: update.op === '++' ? 1 : -1, max: 1 };
  }
  if (
    update.kind !== 'assign' ||
    (update.op !== '+=' && update.op !== '-=') ||
    mentions(update.value, name)
  ) {
    return undefined;
  }
  const step = intRange(update.value, env);
  if (!step || step.lo < 1) return undefined;
  return { direction: update.op === '+=' ? 1 : -1, max: step.hi };
}

function mentions(node: unknown, name: string): boolean {
  if (Array.isArray(node)) return node.some((n) => mentions(n, name));
  if (node === null || typeof node !== 'object') return false;
  const record = node as Record<string, unknown>;
  if (record.kind === 'local' && record.name === name) return true;
  return Object.values(record).some((v) => mentions(v, name));
}

/** Whether `name` is read in an index conversion or a `for` condition, where an `Int` pays off. */
function isIndexLike(node: unknown, name: string): boolean {
  if (Array.isArray(node)) return node.some((n) => isIndexLike(n, name));
  if (node === null || typeof node !== 'object') return false;
  const record = node as Record<string, unknown>;
  if (
    (record.kind === 'cFor' && mentions(record.cond, name)) ||
    (isStdInt(record as unknown as HxExpr) && mentions(record.args, name))
  ) {
    return true;
  }
  return Object.values(record).some((v) => isIndexLike(v, name));
}

function conjuncts(cond: HxExpr | undefined): HxExpr[] {
  if (!cond) return [];
  if (cond.kind === 'binop' && cond.op === '&&') {
    return [...conjuncts(cond.left), ...conjuncts(cond.right)];
  }
  return [cond];
}

/**
 * The extreme value the loop condition lets the counter reach before its
 * update: the largest for a rising counter (`v < E`, `v <= E`, `E > v`), the
 * smallest for a falling one. `undefined` when no conjunct bounds it.
 */
function guardedExtreme(
  cond: HxExpr | undefined,
  name: string,
  direction: 1 | -1,
  env: Env,
): number | undefined {
  const extremes: number[] = [];
  for (const test of conjuncts(cond)) {
    if (test.kind !== 'binop') continue;
    const flipped: Record<string, string> = {
      '<': '>',
      '<=': '>=',
      '>': '<',
      '>=': '<=',
    };
    const [op, bound] = isLocal(test.left, name)
      ? [test.op, test.right]
      : isLocal(test.right, name)
        ? [flipped[test.op], test.left]
        : [undefined, undefined];
    if (!op || !bound || mentions(bound, name)) continue;
    const range = unboundedRange(bound, env);
    if (!range) continue;
    if (direction === 1 && op === '<') extremes.push(range.hi - 1);
    if (direction === 1 && op === '<=') extremes.push(range.hi);
    if (direction === -1 && op === '>') extremes.push(range.lo + 1);
    if (direction === -1 && op === '>=') extremes.push(range.lo);
  }
  if (extremes.length === 0) return undefined;
  return direction === 1 ? Math.min(...extremes) : Math.max(...extremes);
}

/** A counter's range anywhere in the loop, and in its body, where the condition holds. */
interface CounterRange {
  full: IntRange;
  body: IntRange;
}

interface Candidate {
  name: string;
  init: IntRange;
  step?: Step;
}

/** What is known of a counter's value at any time, from its init and direction alone. */
function monotoneRange(candidate: Candidate): IntRange {
  if (!candidate.step) return candidate.init;
  return candidate.step.direction === 1
    ? { lo: candidate.init.lo, hi: Infinity }
    : { lo: -Infinity, hi: candidate.init.hi };
}

/**
 * Ranges of the loop's `let` counters that stay integral and within `Int`:
 * an integral init, no writes but one `±step` update, and a condition that
 * bounds the counter in the direction it moves.
 */
function counterRanges(loop: CFor, env: Env): Map<string, CounterRange> {
  const ranges = new Map<string, CounterRange>();
  if (!loop.blockScoped) return ranges;
  const candidates: Candidate[] = [];
  const initEnv = new Map(env);
  for (const stmt of loop.init) {
    if (stmt.kind !== 'var') return ranges;
    initEnv.delete(stmt.name);
  }
  for (const stmt of loop.init) {
    if (stmt.kind !== 'var') continue;
    const init = stmt.init && intRange(stmt.init, initEnv);
    if (
      !init ||
      !stmt.type ||
      !isFloatType(stmt.type) ||
      loop.perIterationBindings.includes(stmt.name)
    ) {
      continue;
    }
    const name = stmt.name;
    if (
      writesOf([loop.cond, loop.body], name).length > 0 ||
      loop.init.some((s) => s !== stmt && writesOf(s, name).length > 0)
    ) {
      continue;
    }
    const updates = loop.update.filter((u) => writesOf(u, name).length > 0);
    if (updates.length === 0) {
      candidates.push({ name, init });
      continue;
    }
    const step =
      updates.length === 1 && writesOf(updates[0], name)[0] === updates[0]
        ? counterStep(updates[0], name, env)
        : undefined;
    if (step) candidates.push({ name, init, step });
  }
  const boundEnv = new Map(initEnv);
  for (const candidate of candidates) {
    boundEnv.set(candidate.name, monotoneRange(candidate));
  }
  for (const candidate of candidates) {
    const { step, init, name } = candidate;
    if (!step) {
      ranges.set(name, { full: init, body: init });
      continue;
    }
    const others = new Map(boundEnv);
    others.delete(name);
    const extreme = guardedExtreme(loop.cond, name, step.direction, others);
    if (extreme === undefined) continue;
    const rising = step.direction === 1;
    const full = rising
      ? { lo: init.lo, hi: Math.max(init.hi, extreme + step.max) }
      : { lo: Math.min(init.lo, extreme - step.max), hi: init.hi };
    const body = rising
      ? { lo: init.lo, hi: Math.max(init.lo, extreme) }
      : { lo: Math.min(init.hi, extreme), hi: init.hi };
    if (isInt32(full)) ranges.set(name, { full, body });
  }
  return ranges;
}

/**
 * Rewrites one function scope: demoted locals become `Int`, their reads are
 * widened back to `Float` except where an `Int` is as good (comparisons with
 * numbers, array indices), and index conversions `Std.int(e)` of proven
 * integral `e` become plain `Int` arithmetic.
 */
class IntInference {
  stmts(stmts: HxStmt[], outer: Env): HxStmt[] {
    const env = new Map(outer);
    return stmts.map((stmt, i) => this.stmt(stmt, env, stmts.slice(i + 1)));
  }

  /** `scope` is what follows `stmt` in its block: where a declaration is visible. */
  private stmt(
    stmt: HxStmt,
    env: Map<string, IntRange>,
    scope: unknown,
  ): HxStmt {
    const e = (expr: HxExpr) => this.expr(expr, env);
    const s = (body: HxStmt[]) => this.stmts(body, env);
    switch (stmt.kind) {
      case 'expr':
        return { ...stmt, expr: e(stmt.expr) };
      case 'var': {
        const init = stmt.init && e(stmt.init);
        env.delete(stmt.name);
        const range =
          stmt.final &&
          stmt.type &&
          isFloatType(stmt.type) &&
          stmt.init &&
          isIndexLike(scope, stmt.name)
            ? intRange(stmt.init, env)
            : undefined;
        if (!range || !stmt.init) return { ...stmt, init };
        const demoted = { ...stmt, type: INT, init: asInt(stmt.init, env) };
        env.set(stmt.name, range);
        return demoted;
      }
      case 'localFunction':
        env.delete(stmt.name);
        return { ...stmt, fn: this.fn(stmt.fn, env) };
      case 'block':
        return { ...stmt, body: s(stmt.body) };
      case 'if':
        return {
          ...stmt,
          cond: e(stmt.cond),
          then: s(stmt.then),
          else: stmt.else && s(stmt.else),
        };
      case 'while':
        return { ...stmt, cond: e(stmt.cond), body: s(stmt.body) };
      case 'forIn': {
        const inner = new Map(env);
        inner.delete(stmt.name);
        return {
          ...stmt,
          iterable: e(stmt.iterable),
          body: this.stmts(stmt.body, inner),
        };
      }
      case 'switch':
        return {
          ...stmt,
          subject: e(stmt.subject),
          cases: stmt.cases.map((c) => ({ ...c, body: s(c.body) })),
          default: stmt.default && s(stmt.default),
        };
      case 'try':
        return {
          ...stmt,
          body: s(stmt.body),
          catches: stmt.catches.map((c) => this.catchClause(c, env)),
        };
      case 'return':
        return stmt.value ? { ...stmt, value: e(stmt.value) } : stmt;
      case 'throw':
        return { ...stmt, value: e(stmt.value) };
      case 'labeled':
        return { ...stmt, body: this.stmts([stmt.body], env)[0] };
      case 'cFor':
        return this.cFor(stmt, env);
      case 'tsSwitch': {
        const subject = stmt.subject && {
          ...stmt.subject,
          value: e(stmt.subject.value),
        };
        const inner = new Map(env);
        if (stmt.subject) inner.delete(stmt.subject.name);
        return {
          ...stmt,
          subject,
          clauses: stmt.clauses.map((c) => ({
            test: c.test && this.expr(c.test, inner),
            body: this.stmts(c.body, inner),
          })),
        };
      }
      case 'tryFinally':
        return {
          ...stmt,
          body: s(stmt.body),
          catch: stmt.catch && this.catchClause(stmt.catch, env),
          finally: s(stmt.finally),
        };
      default:
        return stmt;
    }
  }

  private catchClause(c: HxCatch, env: Env): HxCatch {
    const inner = new Map(env);
    inner.delete(c.name);
    return { ...c, body: this.stmts(c.body, inner) };
  }

  private cFor(loop: CFor, outer: Env): HxStmt {
    const env = new Map(outer);
    for (const stmt of loop.init) {
      if (stmt.kind === 'var') env.delete(stmt.name);
    }
    const ranges = counterRanges(loop, outer);
    const initEnv = new Map(outer);
    const init = loop.init.map((stmt): HxStmt => {
      if (stmt.kind !== 'var') return this.stmts([stmt], initEnv)[0];
      const value = stmt.init && this.expr(stmt.init, initEnv);
      initEnv.delete(stmt.name);
      const range = ranges.get(stmt.name);
      if (!range || !stmt.init) return { ...stmt, init: value };
      initEnv.set(stmt.name, range.full);
      return { ...stmt, type: INT, init: asInt(stmt.init, outer) };
    });
    const bodyEnv = new Map(env);
    for (const [name, range] of ranges) {
      env.set(name, range.full);
      bodyEnv.set(name, range.body);
    }
    return {
      ...loop,
      init,
      cond: loop.cond && this.expr(loop.cond, env),
      update: loop.update.map((u) => this.expr(u, env)),
      body: this.stmts(loop.body, bodyEnv),
    };
  }

  fn(fn: HxFunction, outer: Env): HxFunction {
    const env = new Map(outer);
    for (const param of fn.params) env.delete(param.name);
    return {
      ...fn,
      params: fn.params.map((p) =>
        p.defaultValue
          ? { ...p, defaultValue: this.expr(p.defaultValue, outer) }
          : p,
      ),
      body: fn.body && this.stmts(fn.body, env),
    };
  }

  /** Operands of a comparison of numbers: `Int` when both are proven integral and one reads a demoted local. */
  private comparison(
    expr: Extract<HxExpr, { kind: 'binop' }>,
    env: Env,
  ): HxExpr {
    const { left, right } = expr;
    if (
      intRange(left, env) &&
      intRange(right, env) &&
      [...env.keys()].some((name) => mentions([left, right], name))
    ) {
      return { ...expr, left: asInt(left, env), right: asInt(right, env) };
    }
    const operand = (e: HxExpr) =>
      e.kind === 'local' && env.has(e.name) ? e : this.expr(e, env);
    return { ...expr, left: operand(left), right: operand(right) };
  }

  expr(expr: HxExpr, env: Env): HxExpr {
    const e = (child: HxExpr) => this.expr(child, env);
    switch (expr.kind) {
      case 'local':
        return env.has(expr.name)
          ? { kind: 'checkType', expr, type: FLOAT, pos: expr.pos }
          : expr;
      case 'call':
        if (isStdInt(expr) && intRange(expr.args[0], env)) {
          return asInt(expr.args[0], env);
        }
        return { ...expr, callee: e(expr.callee), args: expr.args.map(e) };
      case 'binop':
        if (
          COMPARISONS.has(expr.op) &&
          isNumeric(expr.left) &&
          isNumeric(expr.right)
        ) {
          return this.comparison(expr, env);
        }
        return { ...expr, left: e(expr.left), right: e(expr.right) };
      case 'assign':
        if (expr.target.kind === 'local' && env.has(expr.target.name)) {
          return { ...expr, value: asInt(expr.value, env) };
        }
        return { ...expr, target: e(expr.target), value: e(expr.value) };
      case 'unop':
        if (
          (expr.op === '++' || expr.op === '--') &&
          expr.operand.kind === 'local' &&
          env.has(expr.operand.name)
        ) {
          return expr;
        }
        return { ...expr, operand: e(expr.operand) };
      case 'field':
        return { ...expr, target: e(expr.target) };
      case 'index':
        return { ...expr, target: e(expr.target), index: e(expr.index) };
      case 'new':
        return { ...expr, args: expr.args.map(e) };
      case 'ternary':
        return {
          ...expr,
          cond: e(expr.cond),
          then: e(expr.then),
          else: e(expr.else),
        };
      case 'arrayLit':
        return { ...expr, elements: expr.elements.map(e) };
      case 'objectLit':
        return {
          ...expr,
          fields: expr.fields.map((f) => ({ ...f, value: e(f.value) })),
        };
      case 'fn':
        return { ...expr, fn: this.fn(expr.fn, env) };
      case 'cast':
      case 'checkType':
      case 'isOfType':
        return { ...expr, expr: e(expr.expr) };
      case 'blockExpr': {
        const inner = new Map(env);
        const stmts = expr.stmts.map((s, i) =>
          this.stmt(s, inner, [expr.stmts.slice(i + 1), expr.result]),
        );
        return { ...expr, stmts, result: this.expr(expr.result, inner) };
      }
      case 'yield':
        return expr.value ? { ...expr, value: e(expr.value) } : expr;
      case 'await':
        return { ...expr, value: e(expr.value) };
      default:
        return expr;
    }
  }
}

/**
 * Demotes `number` loop counters and `const` indices proven integral and
 * within 32 bits to Haxe `Int` (ADR 0002), so C# and C++ count and index
 * without `Float` arithmetic and `Std.int` conversions. Runs before
 * `lowerCFor`, while loops still carry their counters.
 */
export const inferInt: HxPass = (module) => {
  const inference = new IntInference();
  const empty: Env = new Map();
  const expr = (e: HxExpr) => inference.expr(e, empty);
  const fn = (f: HxFunction): HxFunction => inference.fn(f, empty);
  const field = (f: HxClassField): HxClassField => {
    if (f.kind === 'method') return { ...f, fn: fn(f.fn) };
    if (f.kind === 'var' && f.init) return { ...f, init: expr(f.init) };
    return f;
  };
  const decl = (d: HxDecl): HxDecl => {
    switch (d.kind) {
      case 'moduleFunction':
        return { ...d, fn: fn(d.fn) };
      case 'moduleVar':
        return d.init ? { ...d, init: expr(d.init) } : d;
      case 'class':
        return { ...d, fields: d.fields.map(field) };
      case 'enumAbstract':
        return { ...d, fields: d.fields?.map(field) };
      case 'typedef':
        return d;
    }
  };
  return {
    ...module,
    decls: module.decls.map(decl),
    init: inference.stmts(module.init, empty),
  };
};
