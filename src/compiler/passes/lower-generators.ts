import {
  BOOL,
  constExpr,
  DYNAMIC,
  INT,
  isBoolType,
  isFloatType,
  isIntType,
  localExpr,
  RUNTIME,
  staticCall,
} from '../ir/builders';
import type {
  HxCatch,
  HxExpr,
  HxFunction,
  HxModule,
  HxPass,
  HxStmt,
  HxType,
  PassContext,
} from '../ir/types';
import { transformModule } from '../ir/walk';

type Yield = Extract<HxExpr, { kind: 'yield' | 'await' }>;

/** A `try` whose body holds a resume point: its `catch` becomes a state the router jumps to. */
interface TryRegion {
  catchState: number;
  catchName: string;
  finalizer: boolean;
}

interface LoopTargets {
  breakState: number;
  continueState: number;
}

/** Whether `node` holds a `yield` or an `await` outside nested functions. */
export function containsYield(node: unknown): boolean {
  if (Array.isArray(node)) return node.some(containsYield);
  if (node === null || typeof node !== 'object') return false;
  const record = node as { kind?: unknown };
  if (record.kind === 'yield' || record.kind === 'await') return true;
  if (record.kind === 'fn' || record.kind === 'localFunction') return false;
  return Object.values(record).some(containsYield);
}

/** `node` with every `local` named `from` (and its declarations) renamed to `to`. */
function renameLocal<T>(node: T, from: string, to: string): T {
  if (Array.isArray(node)) {
    return node.map((n: unknown) => renameLocal(n, from, to)) as T;
  }
  if (node === null || typeof node !== 'object') return node;
  const record = node as Record<string, unknown>;
  const renamed: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    renamed[key] =
      key === 'name' &&
      value === from &&
      ['local', 'var', 'forIn'].includes(record.kind as string)
        ? to
        : renameLocal(value, from, to);
  }
  return renamed as T;
}

/** The zero value a hoisted local starts with: Haxe wants captured locals initialised. */
function zeroValue(type: HxType): HxExpr {
  if (isIntType(type)) return { kind: 'const', value: 0, int: true, type };
  if (isFloatType(type)) return { kind: 'const', value: 0, type };
  if (isBoolType(type)) return { kind: 'const', value: false, type };
  return { kind: 'const', value: null, type };
}

function intConst(value: number): HxExpr {
  return { kind: 'const', value, int: true, type: INT };
}

function not(cond: HxExpr): HxExpr {
  return { kind: 'unop', op: '!', postfix: false, operand: cond, type: BOOL };
}

function assign(target: HxExpr, value: HxExpr): HxStmt {
  return {
    kind: 'expr',
    expr: { kind: 'assign', op: '=', target, value, type: target.type },
  };
}

function isArray(type: HxType): boolean {
  const inner = type.kind === 'null' ? type.inner : type;
  return (
    inner.kind === 'path' &&
    inner.path.pack.length === 0 &&
    inner.path.name === 'Array'
  );
}

/**
 * Turns one generator body (already free of `finally`, labels and C-style
 * `for`) into a state machine: every resume point starts a state of a
 * `switch` on `GeneratorCore.state`, and the locals live across states in
 * the enclosing function.
 */
class StateMachine {
  private readonly states: HxStmt[][] = [];
  private readonly stateRegions: TryRegion[][] = [];
  private current: HxStmt[] = [];
  private terminated = false;
  private readonly regionStack: TryRegion[] = [];
  private readonly loops: LoopTargets[] = [];
  private readonly hoisted = new Map<string, HxType>();
  private readonly ctx: HxExpr;

  constructor(
    private readonly context: PassContext,
    ctxName: string,
  ) {
    this.ctx = localExpr(ctxName, {
      kind: 'path',
      path: RUNTIME.generatorCore,
      params: [],
    });
    this.mark(this.newState());
  }

  /** The step function's body and the declarations of the hoisted locals. */
  build(body: HxStmt[]): { hoisted: HxStmt[]; step: HxStmt[] } {
    this.stmts(body);
    this.emit({ kind: 'return', value: this.finish(constExpr(null)) });
    const cases = this.states.map((stmts, state) => ({
      values: [intConst(state)],
      body: stmts,
    }));
    const dispatch: HxStmt = {
      kind: 'while',
      cond: { kind: 'const', value: true, type: BOOL },
      doWhile: false,
      body: [
        {
          kind: 'switch',
          subject: this.ctxField('state', INT),
          cases,
          default: [{ kind: 'return', value: this.finish(constExpr(null)) }],
        },
      ],
    };
    const step: HxStmt[] = this.stateRegions.some((r) => r.length > 0)
      ? [
          {
            kind: 'while',
            cond: { kind: 'const', value: true, type: BOOL },
            doWhile: false,
            body: [{ kind: 'try', body: [dispatch], catches: [this.router()] }],
          },
          { kind: 'return', value: constExpr(null) },
        ]
      : [dispatch, { kind: 'return', value: constExpr(null) }];
    const hoisted: HxStmt[] = [...this.hoisted].map(([name, type]) => ({
      kind: 'var',
      name,
      final: false,
      type,
      init: zeroValue(type),
    }));
    return { hoisted, step };
  }

  private newState(): number {
    this.states.push([]);
    this.stateRegions.push([]);
    return this.states.length - 1;
  }

  /** Ends the open state (falling into `state`) and opens `state`. */
  private mark(state: number): void {
    if (this.states.length > 1 && !this.terminated) {
      this.emit(...this.goto(state));
    }
    this.current = this.states[state];
    this.stateRegions[state] = [...this.regionStack];
    this.terminated = false;
  }

  private emit(...stmts: HxStmt[]): void {
    if (this.terminated) return;
    this.current.push(...stmts);
    const last = stmts[stmts.length - 1];
    if (last && (last.kind === 'return' || last.kind === 'continue')) {
      this.terminated = true;
    }
  }

  private goto(state: number): HxStmt[] {
    return [
      assign(this.ctxField('state', INT), intConst(state)),
      { kind: 'continue' },
    ];
  }

  private jump(state: number): void {
    if (!this.terminated) this.emit(...this.goto(state));
  }

  private ctxField(name: string, type: HxType): HxExpr {
    return { kind: 'field', target: this.ctx, name, type };
  }

  private ctxCall(name: string, args: HxExpr[], type: HxType = DYNAMIC) {
    return {
      kind: 'call',
      callee: this.ctxField(name, DYNAMIC),
      args,
      type,
    } satisfies HxExpr;
  }

  private finish(value: HxExpr): HxExpr {
    return this.ctxCall('finish', [value]);
  }

  private hoist(name: string, type: HxType): string {
    const existing = this.hoisted.get(name);
    if (!existing) {
      this.hoisted.set(name, type);
      return name;
    }
    if (JSON.stringify(existing) === JSON.stringify(type)) return name;
    const renamed = this.context.freshName(name.replace(/^_+/, ''));
    this.hoisted.set(renamed, type);
    return renamed;
  }

  private stmts(stmts: HxStmt[]): void {
    for (let i = 0; i < stmts.length; i++) {
      const stmt = stmts[i];
      if (stmt.kind === 'var') {
        const name = this.hoist(stmt.name, stmt.type ?? DYNAMIC);
        if (name !== stmt.name) {
          stmts = [
            ...stmts.slice(0, i),
            ...renameLocal(stmts.slice(i), stmt.name, name),
          ];
        }
        this.declaration({ ...stmt, name }, stmt.type ?? DYNAMIC);
        continue;
      }
      this.stmt(stmt);
    }
  }

  private declaration(
    stmt: Extract<HxStmt, { kind: 'var' }>,
    type: HxType,
  ): void {
    if (!stmt.init) return;
    const init = this.linearize(stmt.init);
    if (init) this.emit(assign(localExpr(stmt.name, type), init));
  }

  private stmt(stmt: HxStmt): void {
    if (!containsYield(stmt)) {
      this.emit(...this.plain([stmt], false));
      return;
    }
    switch (stmt.kind) {
      case 'expr':
        return this.exprStmt(stmt.expr);
      case 'block':
        return this.stmts(stmt.body);
      case 'if':
        return this.ifStmt(stmt);
      case 'while':
        return stmt.doWhile ? this.doWhile(stmt) : this.whileStmt(stmt);
      case 'forIn':
        return this.forIn(stmt);
      case 'switch':
        return this.switchStmt(stmt);
      case 'try':
        return this.tryStmt(stmt);
      case 'return': {
        const value = this.linearize(stmt.value!);
        if (value) this.emit({ kind: 'return', value: this.finish(value) });
        return;
      }
      case 'throw': {
        const value = this.linearize(stmt.value);
        if (value) this.emit({ kind: 'throw', value });
        return;
      }
      default:
        return this.unsupported(`a yield inside ${stmt.kind}`);
    }
  }

  private exprStmt(expr: HxExpr): void {
    if (expr.kind === 'yield' || expr.kind === 'await') {
      this.yieldPoint(expr, false);
      return;
    }
    const linear = this.linearize(expr);
    if (linear && linear.kind !== 'local') {
      this.emit({ kind: 'expr', expr: linear });
    }
  }

  /** Suspends at `node`; the value sent on resumption lands in a fresh local unless `discard`. */
  private yieldPoint(node: Yield, keep = true): HxExpr | undefined {
    const value = node.value ? this.linearize(node.value) : constExpr(null);
    if (!value) return undefined;
    const resume = this.newState();
    const suspend =
      node.kind === 'await'
        ? 'awaitTo'
        : node.delegate
          ? 'delegateTo'
          : 'yieldTo';
    this.emit({
      kind: 'return',
      value: this.ctxCall(suspend, [intConst(resume), value]),
    });
    this.mark(resume);
    const sent = this.ctxCall('sent', [], node.type);
    if (!keep) {
      this.emit({ kind: 'expr', expr: sent });
      return undefined;
    }
    const temp = localExpr(
      this.hoist(this.context.freshName('sent'), node.type),
      node.type,
    );
    this.emit(assign(temp, sent));
    return temp;
  }

  /**
   * `expr` with each `yield` run first as a resume point and replaced by the
   * value sent back; what JS evaluates before a `yield` is kept in a temp so
   * the order of effects stays. `undefined` (reported) where a `yield` sits
   * in a branch that may not run.
   */
  private linearize(expr: HxExpr): HxExpr | undefined {
    if (!containsYield(expr)) return expr;
    switch (expr.kind) {
      case 'yield':
      case 'await':
        return this.yieldPoint(expr);
      case 'cast':
      case 'checkType':
      case 'isOfType': {
        const inner = this.linearize(expr.expr);
        return inner && { ...expr, expr: inner };
      }
      case 'field': {
        if (expr.safe) break;
        const target = this.linearize(expr.target);
        return target && { ...expr, target };
      }
      case 'unop': {
        if (expr.op === '++' || expr.op === '--') break;
        const operand = this.linearize(expr.operand);
        return operand && { ...expr, operand };
      }
      case 'blockExpr':
        this.stmts(expr.stmts);
        return this.linearize(expr.result);
      case 'binop': {
        if (['&&', '||', '??'].includes(expr.op) && containsYield(expr.right)) {
          return this.shortCircuit(expr);
        }
        const operands = this.operands([expr.left, expr.right]);
        return operands && { ...expr, left: operands[0], right: operands[1] };
      }
      case 'index': {
        const operands = this.operands([expr.target, expr.index]);
        return operands && { ...expr, target: operands[0], index: operands[1] };
      }
      case 'arrayLit': {
        const elements = this.operands(expr.elements);
        return elements && { ...expr, elements };
      }
      case 'objectLit': {
        const values = this.operands(expr.fields.map((f) => f.value));
        return (
          values && {
            ...expr,
            fields: expr.fields.map((f, i) => ({ ...f, value: values[i] })),
          }
        );
      }
      case 'new': {
        const args = this.operands(expr.args);
        return args && { ...expr, args };
      }
      case 'call':
        return this.linearCall(expr);
      case 'assign': {
        if (expr.op === '??=' || containsYield(expr.target)) break;
        const value = this.linearize(expr.value);
        return value && { ...expr, value };
      }
      case 'ternary': {
        const cond = this.linearize(expr.cond);
        if (!cond) return undefined;
        if (!containsYield(expr.then) && !containsYield(expr.else)) {
          return { ...expr, cond };
        }
        return this.conditional(cond, expr.then, expr.else, expr.type);
      }
    }
    this.unsupported('a yield inside this expression');
    return undefined;
  }

  /** `left && right`, `left || right`, `left ?? right` whose `right` suspends: it runs only when `left` says so. */
  private shortCircuit(
    expr: Extract<HxExpr, { kind: 'binop' }>,
  ): HxExpr | undefined {
    const left = this.linearize(expr.left);
    if (!left) return undefined;
    const temp = this.temp('logical', expr.op === '??' ? left.type : expr.type);
    this.emit(assign(temp, left));
    const skip: HxExpr =
      expr.op === '&&'
        ? not(temp)
        : expr.op === '||'
          ? temp
          : {
              kind: 'binop',
              op: '!=',
              left: temp,
              right: constExpr(null),
              type: BOOL,
            };
    const end = this.newState();
    this.emit({ kind: 'if', cond: skip, then: this.goto(end) });
    const right = this.linearize(expr.right);
    if (!right) return undefined;
    this.emit(assign(temp, right));
    this.mark(end);
    return temp;
  }

  /** `cond ? then : otherwise` with a resume point in an arm: only the chosen arm runs. */
  private conditional(
    cond: HxExpr,
    then: HxExpr,
    otherwise: HxExpr,
    type: HxType,
  ): HxExpr | undefined {
    const temp = this.temp('conditional', type);
    const elseState = this.newState();
    const end = this.newState();
    this.emit({ kind: 'if', cond: not(cond), then: this.goto(elseState) });
    const thenValue = this.linearize(then);
    if (!thenValue) return undefined;
    this.emit(assign(temp, thenValue));
    this.jump(end);
    this.mark(elseState);
    const elseValue = this.linearize(otherwise);
    if (!elseValue) return undefined;
    this.emit(assign(temp, elseValue));
    this.mark(end);
    return temp;
  }

  private temp(hint: string, type: HxType): HxExpr {
    return localExpr(this.hoist(this.context.freshName(hint), type), type);
  }

  private linearCall(
    expr: Extract<HxExpr, { kind: 'call' }>,
  ): HxExpr | undefined {
    const callee = expr.callee;
    if (callee.kind === 'field' && !callee.safe) {
      const operands = this.operands([callee.target, ...expr.args]);
      return (
        operands && {
          ...expr,
          callee: { ...callee, target: operands[0] },
          args: operands.slice(1),
        }
      );
    }
    if (containsYield(callee)) {
      this.unsupported('a yield inside this expression');
      return undefined;
    }
    const args = this.operands(expr.args);
    return args && { ...expr, args };
  }

  /** Operands evaluated left to right: those before a later `yield` are kept in temps. */
  private operands(list: HxExpr[]): HxExpr[] | undefined {
    const result: HxExpr[] = [];
    for (let i = 0; i < list.length; i++) {
      const operand = this.linearize(list[i]);
      if (!operand) return undefined;
      const yieldsLater = list.slice(i + 1).some(containsYield);
      result.push(yieldsLater ? this.snapshot(operand) : operand);
    }
    return result;
  }

  private snapshot(expr: HxExpr): HxExpr {
    if (['const', 'local', 'this', 'typeRef', 'fn'].includes(expr.kind)) {
      return expr;
    }
    const temp = localExpr(
      this.hoist(this.context.freshName('operand'), expr.type),
      expr.type,
    );
    this.emit(assign(temp, expr));
    return temp;
  }

  private condition(cond: HxExpr): HxExpr | undefined {
    return this.linearize(cond);
  }

  private ifStmt(stmt: Extract<HxStmt, { kind: 'if' }>): void {
    const cond = this.condition(stmt.cond);
    if (!cond) return;
    const otherwise = this.newState();
    const end = stmt.else ? this.newState() : otherwise;
    this.emit({ kind: 'if', cond: not(cond), then: this.goto(otherwise) });
    this.stmts(stmt.then);
    if (stmt.else) {
      this.jump(end);
      this.mark(otherwise);
      this.stmts(stmt.else);
    }
    this.mark(end);
  }

  private whileStmt(stmt: Extract<HxStmt, { kind: 'while' }>): void {
    const test = this.newState();
    const end = this.newState();
    this.mark(test);
    const cond = this.condition(stmt.cond);
    if (!cond) return;
    this.emit({ kind: 'if', cond: not(cond), then: this.goto(end) });
    this.loopBody(stmt.body, { breakState: end, continueState: test });
    this.jump(test);
    this.mark(end);
  }

  private doWhile(stmt: Extract<HxStmt, { kind: 'while' }>): void {
    const body = this.newState();
    const test = this.newState();
    const end = this.newState();
    this.mark(body);
    this.loopBody(stmt.body, { breakState: end, continueState: test });
    this.mark(test);
    const cond = this.condition(stmt.cond);
    if (!cond) return;
    this.emit({ kind: 'if', cond, then: this.goto(body) });
    this.jump(end);
    this.mark(end);
  }

  private loopBody(body: HxStmt[], targets: LoopTargets): void {
    this.loops.push(targets);
    this.stmts(body);
    this.loops.pop();
  }

  /** `for (x in array)` as an index loop whose array and index survive the yields. */
  private forIn(stmt: Extract<HxStmt, { kind: 'forIn' }>): void {
    if (!isArray(stmt.iterable.type) || containsYield(stmt.iterable)) {
      this.unsupported('a yield inside this for loop');
      return;
    }
    const element =
      stmt.iterable.type.kind === 'path'
        ? (stmt.iterable.type.params[0] ?? DYNAMIC)
        : DYNAMIC;
    const array = localExpr(
      this.hoist(this.context.freshName('array'), stmt.iterable.type),
      stmt.iterable.type,
    );
    const index = localExpr(this.hoist(this.context.freshName('i'), INT), INT);
    const item = localExpr(this.hoist(stmt.name, element), element);
    this.emit(assign(array, stmt.iterable), assign(index, intConst(0)));
    const test = this.newState();
    const end = this.newState();
    this.mark(test);
    this.emit({
      kind: 'if',
      cond: not({
        kind: 'binop',
        op: '<',
        left: index,
        right: { kind: 'field', target: array, name: 'length', type: INT },
        type: BOOL,
      }),
      then: this.goto(end),
    });
    this.emit(
      assign(item, { kind: 'index', target: array, index, type: element }),
      {
        kind: 'expr',
        expr: {
          kind: 'unop',
          op: '++',
          postfix: false,
          operand: index,
          type: INT,
        },
      },
    );
    const body =
      item.kind === 'local' && item.name !== stmt.name
        ? renameLocal(stmt.body, stmt.name, item.name)
        : stmt.body;
    this.loopBody(body, { breakState: end, continueState: test });
    this.jump(test);
    this.mark(end);
  }

  private switchStmt(stmt: Extract<HxStmt, { kind: 'switch' }>): void {
    const subjectValue = this.condition(stmt.subject);
    if (!subjectValue) return;
    const subject = localExpr(
      this.hoist(this.context.freshName('subject'), subjectValue.type),
      subjectValue.type,
    );
    this.emit(assign(subject, subjectValue));
    const end = this.newState();
    const bodies = stmt.cases.map(() => this.newState());
    const fallback = stmt.default ? this.newState() : end;
    stmt.cases.forEach((c, i) => {
      const matches = c.values
        .map((v): HxExpr => ({
          kind: 'binop',
          op: '==',
          left: subject,
          right: v,
          type: BOOL,
        }))
        .reduce((a, b) => ({
          kind: 'binop',
          op: '||',
          left: a,
          right: b,
          type: BOOL,
        }));
      this.emit({ kind: 'if', cond: matches, then: this.goto(bodies[i]) });
    });
    this.jump(fallback);
    stmt.cases.forEach((c, i) => {
      this.mark(bodies[i]);
      this.stmts(c.body);
      this.jump(end);
    });
    if (stmt.default) {
      this.mark(fallback);
      this.stmts(stmt.default);
    }
    this.mark(end);
  }

  private tryStmt(stmt: Extract<HxStmt, { kind: 'try' }>): void {
    if (stmt.catches.length !== 1) {
      this.unsupported('a yield inside a try with several catches');
      return;
    }
    const [handler] = stmt.catches;
    const region: TryRegion = {
      catchState: this.newState(),
      catchName: this.hoist(handler.name, DYNAMIC),
      finalizer: handler.finalizer ?? false,
    };
    const end = this.newState();
    this.regionStack.push(region);
    this.mark(this.newState());
    this.stmts(stmt.body);
    this.jump(end);
    this.regionStack.pop();
    this.mark(region.catchState);
    this.stmts(
      region.catchName === handler.name
        ? handler.body
        : renameLocal(handler.body, handler.name, region.catchName),
    );
    this.jump(end);
    this.mark(end);
  }

  /**
   * The `catch` around the dispatch loop: it sends an exception to the
   * `catch` state of the innermost region of the state that threw. A `catch`
   * clause lets a generator's `return()` through; a `finally` catches it.
   */
  private router(): HxCatch {
    const error = localExpr(this.context.freshName('error'), DYNAMIC);
    const groups = new Map<string, { states: number[]; chain: TryRegion[] }>();
    this.stateRegions.forEach((chain, state) => {
      if (chain.length === 0) return;
      const key = chain.map((r) => r.catchState).join(',');
      const group = groups.get(key) ?? { states: [], chain };
      group.states.push(state);
      groups.set(key, group);
    });
    const isReturn = staticCall(
      RUNTIME.generatorCore,
      'isReturn',
      [error],
      BOOL,
    );
    const cases = [...groups.values()].map(({ states, chain }) => {
      const body: HxStmt[] = [];
      for (const region of [...chain].reverse()) {
        const enter = [
          assign(localExpr(region.catchName, DYNAMIC), error),
          ...this.goto(region.catchState),
        ];
        if (region.finalizer) {
          body.push(...enter);
          break;
        }
        body.push({ kind: 'if', cond: not(isReturn), then: enter });
      }
      return { values: states.map(intConst), body };
    });
    return {
      name: (error as { name: string }).name,
      type: DYNAMIC,
      body: [
        { kind: 'switch', subject: this.ctxField('state', INT), cases },
        { kind: 'throw', value: error },
      ],
    };
  }

  private unsupported(message: string): void {
    this.context.reportUnsupported(message);
    this.emit({
      kind: 'expr',
      expr: { kind: 'unsupported', message, source: '', type: DYNAMIC },
    });
  }

  /**
   * A statement list without resume points, run inside one state: `return`
   * finishes the generator, and a `break`/`continue` of a loop the machine
   * took apart jumps to its state.
   */
  private plain(stmts: HxStmt[], inLoop: boolean): HxStmt[] {
    return stmts.flatMap((stmt): HxStmt[] => {
      switch (stmt.kind) {
        case 'return':
          return [
            {
              kind: 'return',
              value: this.finish(stmt.value ?? constExpr(null)),
            },
          ];
        case 'break':
        case 'continue': {
          const loop = this.loops[this.loops.length - 1];
          if (inLoop || !loop) return [stmt];
          return this.goto(
            stmt.kind === 'break' ? loop.breakState : loop.continueState,
          );
        }
        case 'block':
          return [{ ...stmt, body: this.plain(stmt.body, inLoop) }];
        case 'if':
          return [
            {
              ...stmt,
              then: this.plain(stmt.then, inLoop),
              else: stmt.else && this.plain(stmt.else, inLoop),
            },
          ];
        case 'while':
        case 'forIn':
          return [{ ...stmt, body: this.plain(stmt.body, true) }];
        case 'switch':
          return [
            {
              ...stmt,
              cases: stmt.cases.map((c) => ({
                ...c,
                body: this.plain(c.body, inLoop),
              })),
              default: stmt.default && this.plain(stmt.default, inLoop),
            },
          ];
        case 'try':
          return [
            {
              ...stmt,
              body: this.plain(stmt.body, inLoop),
              catches: stmt.catches.map((c) => ({
                ...c,
                body: this.plain(c.body, inLoop),
              })),
            },
          ];
        default:
          return [stmt];
      }
    });
  }
}

/**
 * The creation of a generator or async body the frontend wrapped:
 * `return new Generator(step)`, `return new AsyncGenerator(step)` or
 * `return Async.run(step)`, possibly behind a cast.
 */
type Creation = Extract<HxExpr, { kind: 'new' | 'call' }>;

function generatorCreation(fn: HxFunction): Creation | undefined {
  const last = fn.body?.[fn.body.length - 1];
  if (last?.kind !== 'return') return undefined;
  const value = last.value?.kind === 'cast' ? last.value.expr : last.value;
  return value?.kind === 'new' || value?.kind === 'call' ? value : undefined;
}

function replaceCreation(value: HxExpr, created: Creation): HxExpr {
  return value.kind === 'cast' ? { ...value, expr: created } : created;
}

function stepFunction(stepArg: HxExpr, context: PassContext) {
  const step = (stepArg as Extract<HxExpr, { kind: 'fn' }>).fn;
  const machine = new StateMachine(context, step.params[0].name);
  const { hoisted, step: body } = machine.build(step.body!);
  return { hoisted, step: { ...stepArg, fn: { ...step, body } } as HxExpr };
}

function lowerGenerator(fn: HxFunction, context: PassContext): HxFunction {
  const created =
    fn.isGenerator || fn.isAsync ? generatorCreation(fn) : undefined;
  const [stepArg] = created?.args ?? [];
  if (!created || stepArg?.kind !== 'fn' || !stepArg.fn.body || !fn.body) {
    return fn;
  }
  const { hoisted, step } = stepFunction(stepArg, context);
  const wrapper = fn.body[fn.body.length - 1] as Extract<
    HxStmt,
    { kind: 'return' }
  >;
  const lowered: Creation = { ...created, args: [step] };
  return {
    ...fn,
    body: [
      ...fn.body.slice(0, -1),
      ...hoisted,
      { kind: 'return', value: replaceCreation(wrapper.value!, lowered) },
    ],
  };
}

/** Module statements with a top-level `await`, run as the body of an async function. */
function lowerTopLevelAwait(init: HxStmt[], context: PassContext): HxStmt[] {
  if (!containsYield(init)) return init;
  const stepArg: HxExpr = {
    kind: 'fn',
    fn: {
      typeParams: [],
      params: [
        {
          name: context.freshName('gen'),
          type: { kind: 'path', path: RUNTIME.generatorCore, params: [] },
        },
      ],
      ret: DYNAMIC,
      body: [...init, { kind: 'return', value: constExpr(null) }],
    },
    type: DYNAMIC,
  };
  const { hoisted, step } = stepFunction(stepArg, context);
  return [
    ...hoisted,
    { kind: 'expr', expr: staticCall(RUNTIME.async, 'run', [step], DYNAMIC) },
  ];
}

/**
 * Turns generator and async bodies into state machines driven by
 * `ts2hx.Generator`, `ts2hx.Async` and `ts2hx.AsyncGenerator` (ADR 0005). Runs last: the bodies are free of `finally`, labels, JS
 * `switch` and C-style `for`, so only Haxe control flow is taken apart.
 */
export const lowerGenerators: HxPass = (module: HxModule, context) => {
  const nested = transformModule(module, {
    expr: (expr) =>
      expr.kind === 'fn'
        ? { ...expr, fn: lowerGenerator(expr.fn, context) }
        : expr,
    stmts: (stmts) =>
      stmts.map((stmt) =>
        stmt.kind === 'localFunction'
          ? { ...stmt, fn: lowerGenerator(stmt.fn, context) }
          : stmt,
      ),
  });
  return {
    ...nested,
    init: lowerTopLevelAwait(nested.init, context),
    decls: nested.decls.map((decl) => {
      switch (decl.kind) {
        case 'moduleFunction':
          return { ...decl, fn: lowerGenerator(decl.fn, context) };
        case 'class':
          return {
            ...decl,
            fields: decl.fields.map((field) =>
              field.kind === 'method'
                ? { ...field, fn: lowerGenerator(field.fn, context) }
                : field,
            ),
          };
        default:
          return decl;
      }
    }),
  };
};
