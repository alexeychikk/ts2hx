import { Binary, BlockStmt, Expr, IfStmt, Lambda, Program, Stmt } from './ast';
import { LangError, RuntimeError, SourcePos } from './errors';
import { Scope, UnboundError } from './scope';
import {
  Callable,
  Closure,
  isTruthy,
  ListValue,
  RecordValue,
  show,
  typeName,
  Value,
  valuesEqual,
} from './values';

class BreakSignal {}

class ContinueSignal {}

class ReturnSignal {
  constructor(readonly value: Value) {}
}

export class ThrownValue extends Error {
  constructor(
    readonly value: Value,
    readonly pos: SourcePos,
  ) {
    super(`uncaught ${show(value)}`);
    this.name = 'ThrownValue';
  }
}

export interface Deferred {
  delay: number;
  callback: Callable;
  label: string;
}

export interface InterpreterOptions {
  maxDepth?: number;
  maxSteps?: number;
  print?: (line: string) => void;
}

export class Interpreter {
  readonly globals = new Scope<Value>();
  readonly deferred: Deferred[] = [];
  readonly output: string[] = [];
  private depth = 0;
  private steps = 0;
  private readonly maxDepth: number;
  private readonly maxSteps: number;
  private readonly sink: (line: string) => void;

  constructor(options: InterpreterOptions = {}) {
    this.maxDepth = options.maxDepth ?? 100;
    this.maxSteps = options.maxSteps ?? 1_000_000;
    this.sink = options.print ?? ((line) => this.output.push(line));
  }

  get stepCount(): number {
    return this.steps;
  }

  print(line: string): void {
    this.sink(line);
  }

  run(program: Program): Value {
    let last: Value = null;
    try {
      for (const stmt of program.body) {
        last = this.execute(stmt, this.globals);
      }
    } catch (e) {
      if (e instanceof BreakSignal || e instanceof ContinueSignal) {
        throw new RuntimeError('break or continue outside a loop', {
          line: 0,
          col: 0,
        });
      }
      if (e instanceof ReturnSignal) {
        return e.value;
      }
      throw e;
    }
    return last;
  }

  runFunction(closure: Closure, scope: Scope<Value>): Value {
    if (this.depth >= this.maxDepth) {
      throw new RuntimeError(
        `stack overflow in ${closure.name}`,
        closure.decl.pos,
      );
    }
    this.depth++;
    try {
      this.executeBlock(closure.decl.body, scope);
      return null;
    } catch (e) {
      if (e instanceof ReturnSignal) return e.value;
      if (e instanceof RuntimeError) {
        throw e.addFrame(`${closure.name}@${closure.decl.pos.line}`);
      }
      throw e;
    } finally {
      this.depth--;
    }
  }

  call(callee: Value, args: Value[], pos: SourcePos): Value {
    if (!(callee instanceof Callable)) {
      throw new RuntimeError(`cannot call a ${typeName(callee)}`, pos);
    }
    return callee.invoke(this, args, pos);
  }

  private tick(pos: SourcePos): void {
    if (++this.steps > this.maxSteps) {
      throw new RuntimeError('step limit exceeded', pos);
    }
  }

  private executeBlock(body: Stmt[], scope: Scope<Value>): Value {
    let last: Value = null;
    for (const stmt of body) {
      last = this.execute(stmt, scope);
    }
    return last;
  }

  private execute(stmt: Stmt, scope: Scope<Value>): Value {
    this.tick(stmt.pos);
    switch (stmt.type) {
      case 'let':
        scope.define(stmt.name, this.evaluate(stmt.init, scope));
        return null;
      case 'fn': {
        const lambda: Lambda = {
          type: 'lambda',
          params: stmt.params,
          body: stmt.body,
          name: stmt.name,
          pos: stmt.pos,
        };
        scope.define(stmt.name, new Closure(lambda, scope));
        return null;
      }
      case 'assign':
        this.assign(stmt.target, stmt.op, stmt.value, scope);
        return null;
      case 'expr':
        return this.evaluate(stmt.expr, scope);
      case 'block':
        return this.executeBlock(stmt.body, scope.child());
      case 'ifStmt':
        return this.executeIf(stmt, scope);
      case 'while': {
        while (isTruthy(this.evaluate(stmt.cond, scope))) {
          if (this.runLoopBody(stmt.body, scope.child())) break;
        }
        return null;
      }
      case 'for': {
        const iterable = this.evaluate(stmt.iterable, scope);
        for (const item of this.iterate(iterable, stmt.pos)) {
          const inner = scope.child();
          inner.define(stmt.name, item);
          if (this.runLoopBody(stmt.body, inner)) break;
        }
        return null;
      }
      case 'return':
        throw new ReturnSignal(
          stmt.value === null ? null : this.evaluate(stmt.value, scope),
        );
      case 'break':
        throw new BreakSignal();
      case 'continue':
        throw new ContinueSignal();
      case 'throw':
        throw new ThrownValue(this.evaluate(stmt.value, scope), stmt.pos);
      case 'try':
        return this.executeTry(stmt.body, stmt.binding, stmt.handler, scope);
    }
  }

  private executeIf(stmt: IfStmt, scope: Scope<Value>): Value {
    if (isTruthy(this.evaluate(stmt.cond, scope))) {
      return this.execute(stmt.then, scope);
    }
    if (stmt.otherwise !== undefined) {
      return this.execute(stmt.otherwise, scope);
    }
    return null;
  }

  private runLoopBody(body: BlockStmt, scope: Scope<Value>): boolean {
    try {
      this.executeBlock(body.body, scope);
    } catch (e) {
      if (e instanceof BreakSignal) return true;
      if (e instanceof ContinueSignal) return false;
      throw e;
    }
    return false;
  }

  private executeTry(
    body: BlockStmt,
    binding: string,
    handler: BlockStmt,
    scope: Scope<Value>,
  ): Value {
    try {
      return this.executeBlock(body.body, scope.child());
    } catch (e) {
      let caught: Value;
      if (e instanceof ThrownValue) {
        caught = e.value;
      } else if (e instanceof LangError) {
        caught = new RecordValue([
          ['kind', e.name],
          ['message', e.message],
          ['line', e.pos.line],
        ]);
      } else {
        throw e;
      }
      const inner = scope.child();
      inner.define(binding, caught);
      return this.executeBlock(handler.body, inner);
    }
  }

  private *iterate(iterable: Value, pos: SourcePos): Generator<Value> {
    if (iterable instanceof ListValue) {
      yield* iterable.items;
    } else if (typeof iterable === 'string') {
      for (const ch of iterable) yield ch;
    } else if (iterable instanceof RecordValue) {
      for (const key of iterable.fields.keys()) yield key;
    } else {
      throw new RuntimeError(
        `cannot iterate over a ${typeName(iterable)}`,
        pos,
      );
    }
  }

  private assign(
    target: Extract<Stmt, { type: 'assign' }>['target'],
    op: '=' | '+=' | '-=',
    valueExpr: Expr,
    scope: Scope<Value>,
  ): void {
    const compute = (current: () => Value): Value => {
      const value = this.evaluate(valueExpr, scope);
      if (op === '=') return value;
      return this.arithmetic(
        op === '+=' ? '+' : '-',
        current(),
        value,
        target.pos,
      );
    };
    if (target.type === 'ident') {
      const value = compute(() => this.lookup(target.name, target.pos, scope));
      try {
        scope.assign(target.name, value);
      } catch (e) {
        if (e instanceof UnboundError)
          throw new RuntimeError(e.message, target.pos);
        throw e;
      }
      return;
    }
    const container = this.evaluate(target.target, scope);
    if (target.type === 'member') {
      if (!(container instanceof RecordValue)) {
        throw new RuntimeError(
          `cannot set field '${target.name}' on ${typeName(container)}`,
          target.pos,
        );
      }
      container.fields.set(
        target.name,
        compute(() => container.get(target.name)),
      );
      return;
    }
    const index = this.evaluate(target.index, scope);
    if (container instanceof ListValue) {
      const i = this.listIndex(container, index, target.pos);
      container.items[i] = compute(() => container.items[i]);
    } else if (container instanceof RecordValue) {
      const key = this.recordKey(index, target.pos);
      container.fields.set(
        key,
        compute(() => container.get(key)),
      );
    } else {
      throw new RuntimeError(
        `cannot index into ${typeName(container)}`,
        target.pos,
      );
    }
  }

  private lookup(name: string, pos: SourcePos, scope: Scope<Value>): Value {
    try {
      return scope.lookup(name);
    } catch (e) {
      if (e instanceof UnboundError) {
        throw new RuntimeError(e.message, pos);
      }
      throw e;
    }
  }

  private listIndex(list: ListValue, index: Value, pos: SourcePos): number {
    if (typeof index !== 'number' || !Number.isInteger(index)) {
      throw new RuntimeError(
        `list index must be an integer, got ${show(index, true)}`,
        pos,
      );
    }
    const i = index < 0 ? list.items.length + index : index;
    if (i < 0 || i >= list.items.length) {
      throw new RuntimeError(
        `index ${index} out of range for list of ${list.items.length}`,
        pos,
      );
    }
    return i;
  }

  private recordKey(index: Value, pos: SourcePos): string {
    if (typeof index !== 'string') {
      throw new RuntimeError(
        `record key must be a string, got ${typeName(index)}`,
        pos,
      );
    }
    return index;
  }

  evaluate(expr: Expr, scope: Scope<Value>): Value {
    switch (expr.type) {
      case 'number':
      case 'string':
      case 'bool':
        return expr.value;
      case 'nil':
        return null;
      case 'ident':
        return this.lookup(expr.name, expr.pos, scope);
      case 'list':
        return new ListValue(
          expr.items.map((item) => this.evaluate(item, scope)),
        );
      case 'record':
        return new RecordValue(
          expr.entries.map(([key, value]) => [
            key,
            this.evaluate(value, scope),
          ]),
        );
      case 'unary': {
        const operand = this.evaluate(expr.operand, scope);
        if (expr.op === 'not') return !isTruthy(operand);
        if (typeof operand !== 'number') {
          throw new RuntimeError(
            `cannot negate a ${typeName(operand)}`,
            expr.pos,
          );
        }
        return -operand;
      }
      case 'binary':
        return this.binary(expr, scope);
      case 'call': {
        const callee = this.evaluate(expr.callee, scope);
        const args = expr.args.map((arg) => this.evaluate(arg, scope));
        return this.call(callee, args, expr.pos);
      }
      case 'index': {
        const target = this.evaluate(expr.target, scope);
        const index = this.evaluate(expr.index, scope);
        if (target instanceof ListValue) {
          return target.items[this.listIndex(target, index, expr.pos)];
        }
        if (target instanceof RecordValue) {
          return target.get(this.recordKey(index, expr.pos));
        }
        if (typeof target === 'string' && typeof index === 'number') {
          return target.charAt(index);
        }
        throw new RuntimeError(
          `cannot index into ${typeName(target)}`,
          expr.pos,
        );
      }
      case 'member': {
        const target = this.evaluate(expr.target, scope);
        if (target instanceof RecordValue) return target.get(expr.name);
        if (expr.name === 'length') {
          if (target instanceof ListValue) return target.items.length;
          if (typeof target === 'string') return target.length;
        }
        throw new RuntimeError(
          `${typeName(target)} has no field '${expr.name}'`,
          expr.pos,
        );
      }
      case 'lambda':
        return new Closure(expr, scope);
      case 'if':
        return isTruthy(this.evaluate(expr.cond, scope))
          ? this.evaluate(expr.then, scope)
          : this.evaluate(expr.otherwise, scope);
    }
  }

  private binary(expr: Binary, scope: Scope<Value>): Value {
    if (expr.op === 'and') {
      const left = this.evaluate(expr.left, scope);
      return isTruthy(left) ? this.evaluate(expr.right, scope) : left;
    }
    if (expr.op === 'or') {
      const left = this.evaluate(expr.left, scope);
      return isTruthy(left) ? left : this.evaluate(expr.right, scope);
    }
    const left = this.evaluate(expr.left, scope);
    const right = this.evaluate(expr.right, scope);
    switch (expr.op) {
      case '==':
        return valuesEqual(left, right);
      case '!=':
        return !valuesEqual(left, right);
      case '..':
        return show(left) + show(right);
      case '<':
      case '<=':
      case '>':
      case '>=':
        return this.compare(expr.op, left, right, expr.pos);
      default:
        return this.arithmetic(expr.op, left, right, expr.pos);
    }
  }

  private compare(
    op: '<' | '<=' | '>' | '>=',
    left: Value,
    right: Value,
    pos: SourcePos,
  ): boolean {
    let order: number;
    if (typeof left === 'number' && typeof right === 'number') {
      order = left - right;
    } else if (typeof left === 'string' && typeof right === 'string') {
      order = left < right ? -1 : left > right ? 1 : 0;
    } else {
      throw new RuntimeError(
        `cannot compare ${typeName(left)} with ${typeName(right)}`,
        pos,
      );
    }
    switch (op) {
      case '<':
        return order < 0;
      case '<=':
        return order <= 0;
      case '>':
        return order > 0;
      case '>=':
        return order >= 0;
    }
  }

  arithmetic(op: string, left: Value, right: Value, pos: SourcePos): Value {
    if (op === '+' && left instanceof ListValue && right instanceof ListValue) {
      return new ListValue([...left.items, ...right.items]);
    }
    if (op === '+' && typeof left === 'string' && typeof right === 'string') {
      return left + right;
    }
    if (typeof left !== 'number' || typeof right !== 'number') {
      throw new RuntimeError(
        `unsupported operands for ${op}: ${typeName(left)} and ${typeName(right)}`,
        pos,
      );
    }
    switch (op) {
      case '+':
        return left + right;
      case '-':
        return left - right;
      case '*':
        return left * right;
      case '/':
        if (right === 0) throw new RuntimeError('division by zero', pos);
        return left / right;
      case '%':
        if (right === 0) throw new RuntimeError('modulo by zero', pos);
        return left % right;
      default:
        throw new RuntimeError(`unknown operator ${op}`, pos);
    }
  }
}
