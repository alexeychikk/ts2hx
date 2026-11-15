import { RuntimeError, SourcePos } from './errors';
import type { Interpreter } from './interpreter';
import {
  Callable,
  fromPlain,
  ListValue,
  NativeFunction,
  NativeImpl,
  RecordValue,
  show,
  toPlain,
  typeName,
  Value,
} from './values';

function expectList(value: Value, fn: string, pos: SourcePos): ListValue {
  if (value instanceof ListValue) return value;
  throw new RuntimeError(`${fn} expects a list, got ${typeName(value)}`, pos);
}

function expectNumber(value: Value, fn: string, pos: SourcePos): number {
  if (typeof value === 'number') return value;
  throw new RuntimeError(`${fn} expects a number, got ${typeName(value)}`, pos);
}

function expectCallable(value: Value, fn: string, pos: SourcePos): Callable {
  if (value instanceof Callable) return value;
  throw new RuntimeError(
    `${fn} expects a function, got ${typeName(value)}`,
    pos,
  );
}

function compareValues(a: Value, b: Value, pos: SourcePos): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (typeof a === 'string' && typeof b === 'string')
    return a < b ? -1 : a > b ? 1 : 0;
  throw new RuntimeError(`cannot order ${typeName(a)} and ${typeName(b)}`, pos);
}

const definitions: Array<[string, number, NativeImpl]> = [
  [
    'print',
    -1,
    (args, _pos, interp) => {
      interp.print(args.map((arg) => show(arg)).join(' '));
      return null;
    },
  ],
  [
    'len',
    1,
    ([value], pos) => {
      if (value instanceof ListValue) return value.items.length;
      if (value instanceof RecordValue) return value.fields.size;
      if (typeof value === 'string') return value.length;
      throw new RuntimeError(`len of ${typeName(value)}`, pos);
    },
  ],
  ['type', 1, ([value]) => typeName(value)],
  ['str', 1, ([value]) => show(value)],
  [
    'num',
    1,
    ([value], pos) => {
      if (typeof value === 'number') return value;
      if (typeof value === 'string') {
        const parsed = Number(value);
        if (!isNaN(parsed) && value.trim() !== '') return parsed;
      }
      throw new RuntimeError(
        `cannot convert ${show(value, true)} to a number`,
        pos,
      );
    },
  ],
  [
    'push',
    2,
    ([list, item], pos) => {
      expectList(list, 'push', pos).items.push(item);
      return list;
    },
  ],
  [
    'pop',
    1,
    ([list], pos) => {
      const items = expectList(list, 'pop', pos).items;
      if (items.length === 0)
        throw new RuntimeError('pop from empty list', pos);
      return items.pop() ?? null;
    },
  ],
  [
    'keys',
    1,
    ([record], pos) => {
      if (!(record instanceof RecordValue)) {
        throw new RuntimeError(
          `keys expects a record, got ${typeName(record)}`,
          pos,
        );
      }
      return new ListValue(Array.from(record.fields.keys()));
    },
  ],
  [
    'has',
    2,
    ([record, key]) =>
      record instanceof RecordValue &&
      typeof key === 'string' &&
      record.fields.has(key),
  ],
  [
    'range',
    -1,
    (args, pos) => {
      const [start, end, step] =
        args.length === 1
          ? [0, expectNumber(args[0], 'range', pos), 1]
          : [
              expectNumber(args[0], 'range', pos),
              expectNumber(args[1], 'range', pos),
              args.length > 2 ? expectNumber(args[2], 'range', pos) : 1,
            ];
      if (step === 0)
        throw new RuntimeError('range step must not be zero', pos);
      const items: Value[] = [];
      for (let i = start; step > 0 ? i < end : i > end; i += step)
        items.push(i);
      return new ListValue(items);
    },
  ],
  [
    'map',
    2,
    ([list, fn], pos, interp) => {
      const callee = expectCallable(fn, 'map', pos);
      return new ListValue(
        expectList(list, 'map', pos).items.map((item) =>
          interp.call(callee, [item], pos),
        ),
      );
    },
  ],
  [
    'filter',
    2,
    ([list, fn], pos, interp) => {
      const callee = expectCallable(fn, 'filter', pos);
      const kept = expectList(list, 'filter', pos).items.filter((item) => {
        const result = interp.call(callee, [item], pos);
        return result !== null && result !== false;
      });
      return new ListValue(kept);
    },
  ],
  [
    'reduce',
    3,
    ([list, fn, initial], pos, interp) => {
      const callee = expectCallable(fn, 'reduce', pos);
      return expectList(list, 'reduce', pos).items.reduce<Value>(
        (acc, item) => interp.call(callee, [acc, item], pos),
        initial,
      );
    },
  ],
  [
    'sort',
    -1,
    (args, pos, interp) => {
      const items = expectList(args[0], 'sort', pos).items;
      const by = args.length > 1 ? expectCallable(args[1], 'sort', pos) : null;
      const keyed = items.map((item) => ({
        item,
        key: by === null ? item : interp.call(by, [item], pos),
      }));
      keyed.sort((a, b) => compareValues(a.key, b.key, pos));
      return new ListValue(keyed.map((entry) => entry.item));
    },
  ],
  [
    'join',
    2,
    ([list, sep], pos) => {
      if (typeof sep !== 'string')
        throw new RuntimeError('join separator must be a string', pos);
      return expectList(list, 'join', pos)
        .items.map((item) => show(item))
        .join(sep);
    },
  ],
  [
    'split',
    2,
    ([text, sep], pos) => {
      if (typeof text !== 'string' || typeof sep !== 'string') {
        throw new RuntimeError('split expects two strings', pos);
      }
      return new ListValue(text.split(sep));
    },
  ],
  [
    'upper',
    1,
    ([text]) => (typeof text === 'string' ? text.toUpperCase() : null),
  ],
  ['floor', 1, ([value], pos) => Math.floor(expectNumber(value, 'floor', pos))],
  ['sqrt', 1, ([value], pos) => Math.sqrt(expectNumber(value, 'sqrt', pos))],
  [
    'fixed',
    2,
    ([value, digits], pos) =>
      expectNumber(value, 'fixed', pos).toFixed(
        expectNumber(digits, 'fixed', pos),
      ),
  ],
  [
    'json',
    -1,
    (args) => {
      const indent =
        args.length > 1 && typeof args[1] === 'number' ? args[1] : undefined;
      return JSON.stringify(toPlain(args[0]), null, indent) ?? 'null';
    },
  ],
  [
    'parse_json',
    1,
    ([text], pos) => {
      if (typeof text !== 'string')
        throw new RuntimeError('parse_json expects a string', pos);
      try {
        return fromPlain(JSON.parse(text));
      } catch (e) {
        if (e instanceof SyntaxError) {
          throw new RuntimeError('invalid JSON', pos);
        }
        throw e;
      }
    },
  ],
  [
    'assert',
    2,
    ([cond, message], pos) => {
      if (cond === null || cond === false) {
        throw new RuntimeError(`assertion failed: ${show(message)}`, pos);
      }
      return true;
    },
  ],
  [
    'defer',
    2,
    ([delay, fn], pos, interp) => {
      const callback = expectCallable(fn, 'defer', pos);
      interp.deferred.push({
        delay: expectNumber(delay, 'defer', pos),
        callback,
        label: callback.name,
      });
      return interp.deferred.length;
    },
  ],
];

export function installBuiltins(interpreter: Interpreter): string[] {
  const names: string[] = [];
  for (const [name, arity, impl] of definitions) {
    interpreter.globals.define(name, new NativeFunction(name, arity, impl));
    names.push(name);
  }
  interpreter.globals.define('PI', Math.PI);
  return names;
}
