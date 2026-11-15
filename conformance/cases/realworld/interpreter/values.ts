import { Lambda } from './ast';
import { RuntimeError, SourcePos } from './errors';
import type { Interpreter } from './interpreter';
import { Scope } from './scope';
import { quote } from './util/strings';

export class ListValue {
  constructor(readonly items: Value[] = []) {}
}

export class RecordValue {
  readonly fields = new Map<string, Value>();

  constructor(entries: Array<[string, Value]> = []) {
    for (const [key, value] of entries) {
      this.fields.set(key, value);
    }
  }

  get(key: string): Value {
    return this.fields.get(key) ?? null;
  }
}

export abstract class Callable {
  abstract readonly name: string;
  abstract readonly arity: number;

  abstract invoke(
    interpreter: Interpreter,
    args: Value[],
    pos: SourcePos,
  ): Value;

  describe(): string {
    return `<fn ${this.name}/${this.arity < 0 ? '*' : this.arity}>`;
  }
}

export class Closure extends Callable {
  readonly name: string;

  constructor(
    readonly decl: Lambda,
    readonly scope: Scope<Value>,
  ) {
    super();
    this.name = decl.name ?? 'anonymous';
  }

  get arity(): number {
    return this.decl.params.length;
  }

  invoke(interpreter: Interpreter, args: Value[], pos: SourcePos): Value {
    if (args.length !== this.arity) {
      throw new RuntimeError(
        `${this.name} expects ${this.arity} argument${this.arity === 1 ? '' : 's'}, got ${args.length}`,
        pos,
      );
    }
    const scope = this.scope.child();
    this.decl.params.forEach((param, i) => scope.define(param, args[i]));
    return interpreter.runFunction(this, scope);
  }
}

export type NativeImpl = (
  args: Value[],
  pos: SourcePos,
  interpreter: Interpreter,
) => Value;

export class NativeFunction extends Callable {
  constructor(
    readonly name: string,
    readonly arity: number,
    private readonly impl: NativeImpl,
  ) {
    super();
  }

  invoke(interpreter: Interpreter, args: Value[], pos: SourcePos): Value {
    if (this.arity >= 0 && args.length !== this.arity) {
      throw new RuntimeError(
        `${this.name} expects ${this.arity} arguments, got ${args.length}`,
        pos,
      );
    }
    return this.impl(args, pos, interpreter);
  }
}

export type Value =
  number | string | boolean | null | ListValue | RecordValue | Callable;

export type TypeName =
  'number' | 'string' | 'bool' | 'nil' | 'list' | 'record' | 'function';

export function typeName(value: Value): TypeName {
  if (value === null) return 'nil';
  if (typeof value === 'number') return 'number';
  if (typeof value === 'string') return 'string';
  if (typeof value === 'boolean') return 'bool';
  if (value instanceof ListValue) return 'list';
  if (value instanceof RecordValue) return 'record';
  return 'function';
}

export function isTruthy(value: Value): boolean {
  if (value === null || value === false) return false;
  if (value === 0 || value === '') return false;
  return true;
}

export function valuesEqual(a: Value, b: Value): boolean {
  if (a instanceof ListValue && b instanceof ListValue) {
    return (
      a.items.length === b.items.length &&
      a.items.every((item, i) => valuesEqual(item, b.items[i]))
    );
  }
  if (a instanceof RecordValue && b instanceof RecordValue) {
    if (a.fields.size !== b.fields.size) return false;
    for (const [key, value] of a.fields) {
      if (!b.fields.has(key) || !valuesEqual(value, b.get(key))) return false;
    }
    return true;
  }
  return a === b;
}

export function show(value: Value, nested = false): string {
  if (value === null) return 'nil';
  if (typeof value === 'string') return nested ? quote(value) : value;
  if (typeof value === 'number' || typeof value === 'boolean')
    return String(value);
  if (value instanceof ListValue) {
    return `[${value.items.map((item) => show(item, true)).join(', ')}]`;
  }
  if (value instanceof RecordValue) {
    const parts: string[] = [];
    value.fields.forEach((field, key) =>
      parts.push(`${key}: ${show(field, true)}`),
    );
    return parts.length === 0 ? '{}' : `{ ${parts.join(', ')} }`;
  }
  return value.describe();
}

export function toPlain(value: Value): unknown {
  if (value instanceof ListValue) return value.items.map(toPlain);
  if (value instanceof RecordValue) {
    const out: Record<string, unknown> = {};
    for (const [key, field] of value.fields) {
      out[key] = toPlain(field);
    }
    return out;
  }
  if (value instanceof Callable) return value.describe();
  return value;
}

export function fromPlain(data: unknown): Value {
  if (data === null || data === undefined) return null;
  if (
    typeof data === 'number' ||
    typeof data === 'string' ||
    typeof data === 'boolean'
  ) {
    return data;
  }
  if (Array.isArray(data)) {
    return new ListValue(data.map((item: unknown) => fromPlain(item)));
  }
  const record = new RecordValue();
  for (const [key, field] of Object.entries(data as Record<string, unknown>)) {
    record.fields.set(key, fromPlain(field));
  }
  return record;
}
