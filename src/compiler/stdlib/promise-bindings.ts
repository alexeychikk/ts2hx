import ts from 'typescript';

import {
  arrayType,
  constExpr,
  DYNAMIC,
  RUNTIME,
  staticCall,
  STRING,
  typePath,
  VOID,
  sameType,
} from '../ir/builders';
import type { HxExpr, HxType, HxTypePath, SourcePos } from '../ir/types';
import type { BoundCall, CallBinding, PropertyBinding } from './bindings';
import { padCallback } from './callbacks';

/** `ts2hx.Promise<T>`: an abstract over the untyped `PromiseCore` (ADR 0002). */
export const PROMISE_PATH: HxTypePath = typePath(['ts2hx'], 'Promise');

/** Node's `Timeout`, as `setTimeout`/`setInterval` return it. */
export const TIMEOUT_TYPE: HxType = {
  kind: 'path',
  path: typePath(['ts2hx'], 'Timeout', 'EventLoop'),
  params: [],
};

/** `ts2hx.Promise<T>`; a `void` result becomes `Dynamic`, as `Void` is no type argument. */
export function promiseType(value: HxType): HxType {
  return {
    kind: 'path',
    path: PROMISE_PATH,
    params: [sameType(value, VOID) ? DYNAMIC : value],
  };
}

function isPromisePath(path: HxTypePath): boolean {
  return (
    path.pack.join('.') === 'ts2hx' &&
    path.name === 'Promise' &&
    (path.module ?? path.name) === 'Promise'
  );
}

/** Value type of a `ts2hx.Promise<T>`, `undefined` for other types. */
export function promiseValue(type: HxType): HxType | undefined {
  const inner = type.kind === 'null' ? type.inner : type;
  return inner.kind === 'path' && isPromisePath(inner.path)
    ? (inner.params[0] ?? DYNAMIC)
    : undefined;
}

function isLibDeclaration(declaration: ts.Declaration): boolean {
  const file = declaration.getSourceFile();
  return (
    file.hasNoDefaultLib ||
    /[\\/]typescript[\\/]lib[\\/]/.test(file.fileName) ||
    /[\\/]@types[\\/]node[\\/]/.test(file.fileName)
  );
}

function isLibSymbol(symbol: ts.Symbol | undefined): symbol is ts.Symbol {
  const declarations = symbol?.declarations ?? [];
  return declarations.length > 0 && declarations.every(isLibDeclaration);
}

/**
 * Haxe type of a lib promise or timer type: `Promise<T>` with `T` mapped by `map`,
 * Node's `Timeout`; `undefined` for other types.
 */
export function libAsyncType(
  type: ts.Type,
  checker: ts.TypeChecker,
  map: (type: ts.Type) => HxType,
): HxType | undefined {
  const symbol = type.symbol;
  if (!isLibSymbol(symbol)) {
    return undefined;
  }
  if (symbol.name === 'Promise' && symbol.flags & ts.SymbolFlags.Interface) {
    const [value] = checker.getTypeArguments(type as ts.TypeReference);
    return promiseType(value ? map(value) : DYNAMIC);
  }
  if (
    symbol.name === 'Timeout' &&
    /(^|\.)NodeJS\.Timeout$/.test(checker.getFullyQualifiedName(symbol)) &&
    symbol.flags & (ts.SymbolFlags.Interface | ts.SymbolFlags.Class)
  ) {
    return TIMEOUT_TYPE;
  }
  return undefined;
}

/** A callback the runtime calls with exactly `params` arguments, or `undefined` when it cannot be adapted. */
function callback(
  expr: HxExpr,
  params: HxType[],
  freshName: (hint: string) => string,
): HxExpr | undefined {
  if (expr.type.kind !== 'fn') {
    return expr;
  }
  if (params.length === 0) {
    return expr.type.args.length === 0 ? expr : undefined;
  }
  return padCallback(expr, params[0], params.slice(1), freshName);
}

function callbacks(
  args: HxExpr[],
  params: HxType[][],
  freshName: (hint: string) => string,
): HxExpr[] | undefined {
  if (args.length > params.length) {
    return undefined;
  }
  const adapted = args.map((arg, i) => callback(arg, params[i], freshName));
  return adapted.every((arg) => arg !== undefined) ? adapted : undefined;
}

function cast(expr: HxExpr, type: HxType): HxExpr {
  return { kind: 'cast', expr, checked: false, type, pos: expr.pos };
}

/** `p.then(…)`, `p.catch(…)`, `p.finally(…)`: a method of the abstract, cast to the checker's result type. */
function promiseMethod(name: string, arity: (value: HxType) => HxType[][]) {
  return ({
    receiver,
    args,
    spreadLast,
    freshName,
    type,
    pos,
  }: BoundCall): HxExpr | undefined => {
    const value = receiver && promiseValue(receiver.expr.type);
    if (!receiver || value === undefined || spreadLast) {
      return undefined;
    }
    const adapted = callbacks(args, arity(value), freshName);
    return (
      adapted &&
      cast(
        {
          kind: 'call',
          callee: {
            kind: 'field',
            target: receiver.expr,
            name,
            type: DYNAMIC,
          },
          args: adapted,
          type: promiseType(DYNAMIC),
          pos,
        },
        type,
      )
    );
  };
}

/** `Promise.resolve(…)` and the other statics of the `Promise` constructor. */
function promiseStatic(
  name: string,
  accepts: (args: HxExpr[]) => boolean,
): CallBinding {
  return ({ receiver, args, spreadLast, type, pos }) =>
    receiver?.libKey !== 'Promise' || spreadLast || !accepts(args)
      ? undefined
      : cast(
          staticCall(PROMISE_PATH, name, args, promiseType(DYNAMIC), pos),
          type,
        );
}

function isArray(type: HxType): boolean {
  const inner = type.kind === 'null' ? type.inner : type;
  return (
    inner.kind === 'path' &&
    inner.path.pack.length === 0 &&
    inner.path.name === 'Array'
  );
}

const oneArray = (args: HxExpr[]) => args.length === 1 && isArray(args[0].type);

/** `setTimeout`/`setInterval(callback, delay?, ...args)`: the callback takes the extra arguments. */
function timer(name: string): CallBinding {
  return ({ receiver, args, spreadLast, freshName, type, pos }) => {
    if (receiver || spreadLast || args.length === 0) {
      return undefined;
    }
    const [handler, delay, ...extra] = args;
    const adapted = callback(
      handler,
      extra.map((arg) => arg.type),
      freshName,
    );
    if (!adapted) {
      return undefined;
    }
    const callArgs = [adapted, delay ?? constExpr(null, pos)];
    if (extra.length > 0) {
      callArgs.push({
        kind: 'arrayLit',
        elements: extra,
        type: arrayType(DYNAMIC),
        pos,
      });
    }
    return staticCall(RUNTIME.eventLoop, name, callArgs, type, pos);
  };
}

const clearTimer: CallBinding = ({ receiver, args, spreadLast, pos }) =>
  receiver || spreadLast || args.length > 1
    ? undefined
    : staticCall(
        RUNTIME.eventLoop,
        'clearTimeout',
        [args[0] ?? constExpr(null, pos)],
        VOID,
        pos,
      );

/** `new Promise(executor)`: the executor takes `resolve` and `reject`. */
export function newPromise(
  args: HxExpr[],
  type: HxType,
  freshName: (hint: string) => string,
  pos?: SourcePos,
): HxExpr | undefined {
  const executor =
    args.length === 1
      ? callback(args[0], [DYNAMIC, DYNAMIC], freshName)
      : undefined;
  return (
    executor &&
    cast(
      {
        kind: 'new',
        path: PROMISE_PATH,
        typeArgs: [DYNAMIC],
        args: [executor],
        type: promiseType(DYNAMIC),
        pos,
      },
      type,
    )
  );
}

export const PROMISE_CALL_BINDINGS: ReadonlyArray<[string, CallBinding]> = [
  ['Promise.then', promiseMethod('then', (value) => [[value], [DYNAMIC]])],
  ['Promise.catch', promiseMethod('catchError', () => [[DYNAMIC]])],
  ['Promise.finally', promiseMethod('finally', () => [[]])],
  [
    'PromiseConstructor.resolve',
    promiseStatic('resolve', (a) => a.length <= 1),
  ],
  ['PromiseConstructor.reject', promiseStatic('reject', (a) => a.length <= 1)],
  ['PromiseConstructor.all', promiseStatic('all', oneArray)],
  ['PromiseConstructor.allSettled', promiseStatic('allSettled', oneArray)],
  ['PromiseConstructor.race', promiseStatic('race', oneArray)],
  ['PromiseConstructor.any', promiseStatic('any', oneArray)],
  ['setTimeout', timer('setTimeout')],
  ['setInterval', timer('setInterval')],
  ['clearTimeout', clearTimer],
  ['clearInterval', clearTimer],
  [
    'queueMicrotask',
    ({ receiver, args, spreadLast, freshName, pos }) => {
      const task =
        !receiver && !spreadLast && args.length === 1
          ? callback(args[0], [], freshName)
          : undefined;
      return (
        task &&
        staticCall(RUNTIME.eventLoop, 'queueMicrotask', [task], VOID, pos)
      );
    },
  ],
];

const field =
  (name: string, type: HxType = DYNAMIC): PropertyBinding =>
  (receiver, pos) => ({ kind: 'field', target: receiver, name, type, pos });

/** Fields of `Promise.allSettled` results (`ts2hx.Promise.SettledResult`). */
export const PROMISE_PROPERTY_BINDINGS: ReadonlyArray<
  [string, PropertyBinding]
> = [
  ['status', field('status', STRING)],
  ['PromiseFulfilledResult.status', field('status', STRING)],
  ['PromiseRejectedResult.status', field('status', STRING)],
  ['PromiseFulfilledResult.value', field('value')],
  ['PromiseRejectedResult.reason', field('reason')],
];
