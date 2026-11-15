import ts from 'typescript';

import { arrayType, DYNAMIC, INT, RUNTIME, VOID } from '../ir/builders';
import type { HxExpr, HxType, HxTypePath, SourcePos } from '../ir/types';
import type { CallBinding, PropertyBinding } from './bindings';
import { arrayFrom } from './array-bindings';
import { padCallback } from './callbacks';

const MAP_NAMES = new Set(['Map', 'ReadonlyMap', 'WeakMap']);
const SET_NAMES = new Set(['Set', 'ReadonlySet', 'WeakSet']);
function isLibSymbol(symbol: ts.Symbol | undefined): symbol is ts.Symbol {
  const declarations = symbol?.declarations ?? [];
  return (
    declarations.length > 0 &&
    declarations.every((d) => {
      const file = d.getSourceFile();
      return (
        file.hasNoDefaultLib ||
        /[\\/]typescript[\\/]lib[\\/]/.test(file.fileName)
      );
    })
  );
}

export function jsMapType(key: HxType, value: HxType): HxType {
  return { kind: 'path', path: RUNTIME.jsMap, params: [key, value] };
}

export function jsSetType(value: HxType): HxType {
  return { kind: 'path', path: RUNTIME.jsSet, params: [value] };
}

export function jsIteratorType(value: HxType): HxType {
  return { kind: 'path', path: RUNTIME.jsIterator, params: [value] };
}

/** Haxe type of a lib collection type: `Map`/`Set` (and their weak and readonly forms) and their iterators. */
export function libCollectionType(
  type: ts.Type,
  checker: ts.TypeChecker,
  map: (type: ts.Type) => HxType,
): HxType | undefined {
  const symbol = type.symbol;
  if (!isLibSymbol(symbol) || !(symbol.flags & ts.SymbolFlags.Interface)) {
    return undefined;
  }
  const params = () =>
    checker.getTypeArguments(type as ts.TypeReference).map((t) => map(t));
  if (MAP_NAMES.has(symbol.name)) {
    const [key = DYNAMIC, value = DYNAMIC] = params();
    return jsMapType(key, value);
  }
  if (SET_NAMES.has(symbol.name)) {
    const [value = DYNAMIC] = params();
    return jsSetType(value);
  }
  if (symbol.name === 'MapIterator' || symbol.name === 'SetIterator') {
    const [value = DYNAMIC] = params();
    return jsIteratorType(value);
  }
  return undefined;
}

function samePath(actual: HxTypePath, path: HxTypePath): boolean {
  return (
    actual.pack.join('.') === path.pack.join('.') &&
    actual.name === path.name &&
    (actual.module ?? actual.name) === (path.module ?? path.name)
  );
}

function pathParams(type: HxType, path: HxTypePath): HxType[] | undefined {
  const inner = type.kind === 'null' ? type.inner : type;
  return inner.kind === 'path' && samePath(inner.path, path)
    ? inner.params
    : undefined;
}

/** Whether a value is a `JsMap`, `JsSet` or `JsIterator`, which `for…of` and spreads walk through `collectionArray`. */
export function isCollectionType(type: HxType): boolean {
  return [RUNTIME.jsMap, RUNTIME.jsSet, RUNTIME.jsIterator].some(
    (path) => pathParams(type, path) !== undefined,
  );
}

/** The array a `for…of` or a spread walks over a `JsMap`, `JsSet` or `JsIterator`, or `undefined` for other values. */
export function collectionArray(expr: HxExpr): HxExpr | undefined {
  const mapParams = pathParams(expr.type, RUNTIME.jsMap);
  if (mapParams) {
    return toArray(
      method(expr, 'entries', [], jsIteratorType(arrayType(DYNAMIC))),
      arrayType(DYNAMIC),
    );
  }
  const setParams = pathParams(expr.type, RUNTIME.jsSet);
  if (setParams) {
    const [value = DYNAMIC] = setParams;
    return toArray(method(expr, 'values', [], jsIteratorType(value)), value);
  }
  const iteratorParams = pathParams(expr.type, RUNTIME.jsIterator);
  if (iteratorParams) {
    return toArray(expr, iteratorParams[0] ?? DYNAMIC);
  }
  return undefined;
}

function toArray(iterator: HxExpr, element: HxType): HxExpr {
  return method(iterator, 'toArray', [], arrayType(element));
}

function method(
  target: HxExpr,
  name: string,
  args: HxExpr[],
  type: HxType,
  pos?: SourcePos,
): HxExpr {
  return {
    kind: 'call',
    callee: { kind: 'field', target, name, type: DYNAMIC, pos },
    args,
    type,
    pos: pos ?? target.pos,
  };
}

/** `new Map(entries?)` / `new Set(values?)` (and the weak forms) of the given Haxe type. */
export function newCollection(
  type: HxType,
  args: HxExpr[],
  pos?: SourcePos,
): HxExpr | undefined {
  const isMap = pathParams(type, RUNTIME.jsMap);
  const isSet = pathParams(type, RUNTIME.jsSet);
  const params = isMap ?? isSet;
  if (!params || args.length > 1) return undefined;
  const source = args[0];
  const initial =
    source === undefined
      ? []
      : [
          collectionArray(source) ??
            (isArray(source.type) ? source : undefined),
        ];
  if (initial.some((a) => a === undefined)) return undefined;
  return {
    kind: 'new',
    path: isMap ? RUNTIME.jsMap : RUNTIME.jsSet,
    typeArgs: params,
    args: initial as HxExpr[],
    type,
    pos,
  };
}

function isArray(type: HxType): boolean {
  const inner = type.kind === 'null' ? type.inner : type;
  return inner.kind === 'path' && inner.path.name === 'Array';
}

function receiverMethod(name: string, argCount: number): CallBinding {
  return ({ receiver, args, pos, spreadLast, type }) =>
    receiver &&
    !spreadLast &&
    args.length === argCount &&
    (pathParams(receiver.expr.type, RUNTIME.jsMap) ??
      pathParams(receiver.expr.type, RUNTIME.jsSet))
      ? method(receiver.expr, name, args, type, pos)
      : undefined;
}

/** `m.set(k, v)` / `s.add(v)`: chaining returns the receiver's own type. */
function chaining(name: string, argCount: number): CallBinding {
  return (call) =>
    call.receiver
      ? receiverMethod(
          name,
          argCount,
        )({ ...call, type: call.receiver.expr.type })
      : undefined;
}

function forEach(collection: HxTypePath): CallBinding {
  return ({ receiver, args, pos, spreadLast, freshName }) => {
    const params = receiver && pathParams(receiver.expr.type, collection);
    if (!params || spreadLast || args.length !== 1) return undefined;
    const [first = DYNAMIC, second = first] =
      collection === RUNTIME.jsMap ? [params[1], params[0]] : params;
    const callback = padCallback(
      args[0],
      first,
      [second, receiver.expr.type],
      freshName,
    );
    return callback
      ? method(receiver.expr, 'forEach', [callback], VOID, pos)
      : undefined;
  };
}

function bindings(owner: string): Array<[string, CallBinding]> {
  return [
    [`${owner}.get`, receiverMethod('get', 1)],
    [`${owner}.has`, receiverMethod('has', 1)],
    [`${owner}.delete`, receiverMethod('delete', 1)],
    [`${owner}.clear`, receiverMethod('clear', 0)],
    [`${owner}.keys`, receiverMethod('keys', 0)],
    [`${owner}.values`, receiverMethod('values', 0)],
    [`${owner}.entries`, receiverMethod('entries', 0)],
  ];
}

/** `Array.from(collection, mapFn?)`. */
const fromCollection: CallBinding = (call) => {
  const [source] = call.args;
  const values = source && collectionArray(source);
  if (!values) return undefined;
  return call.args.length === 1
    ? values
    : arrayFrom({ ...call, args: [values, ...call.args.slice(1)] });
};

/** `Map`/`Set` methods (ADR 0005); the weak forms share them. */
export const COLLECTION_CALL_BINDINGS: ReadonlyArray<[string, CallBinding]> = [
  ...['Map', 'ReadonlyMap', 'WeakMap', 'Set', 'ReadonlySet', 'WeakSet'].flatMap(
    bindings,
  ),
  ['Map.set', chaining('set', 2)],
  ['WeakMap.set', chaining('set', 2)],
  ['Set.add', chaining('add', 1)],
  ['WeakSet.add', chaining('add', 1)],
  ['Map.forEach', forEach(RUNTIME.jsMap)],
  ['ReadonlyMap.forEach', forEach(RUNTIME.jsMap)],
  ['Set.forEach', forEach(RUNTIME.jsSet)],
  ['ReadonlySet.forEach', forEach(RUNTIME.jsSet)],
  ['ArrayConstructor.from', fromCollection],
];

const size: PropertyBinding = (receiver, pos) => ({
  kind: 'field',
  target: receiver,
  name: 'size',
  type: INT,
  pos,
});

/** `m.size` / `s.size`. */
export const COLLECTION_PROPERTY_BINDINGS: ReadonlyArray<
  [string, PropertyBinding]
> = [
  ['Map.size', size],
  ['ReadonlyMap.size', size],
  ['Set.size', size],
  ['ReadonlySet.size', size],
];
