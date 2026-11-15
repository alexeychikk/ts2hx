import ts from 'typescript';

import { arrayType, DYNAMIC, RUNTIME, staticCall } from '../ir/builders';
import type { HxExpr, HxType, HxTypePath, SourcePos } from '../ir/types';
import type { CallBinding } from './bindings';

/** Haxe name of a `[Symbol.iterator]()` member (`Iter.ITERATOR_METHOD` in the runtime). */
export const ITERATOR_METHOD = '__ts2hx_iterator';

const ITERABLE_NAMES = new Set([
  'Iterator',
  'Iterable',
  'IterableIterator',
  'IteratorObject',
]);

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

export function generatorType(value: HxType): HxType {
  return { kind: 'path', path: RUNTIME.generator, params: [value] };
}

export function jsIterableType(value: HxType): HxType {
  return { kind: 'path', path: RUNTIME.jsIterable, params: [value] };
}

/** Haxe type of the lib iteration types: `Generator<T>` → `ts2hx.Generator<T>`, `Iterator<T>`/`Iterable<T>`/… → `ts2hx.JsIterable<T>`. */
export function libIterableType(
  type: ts.Type,
  checker: ts.TypeChecker,
  map: (type: ts.Type) => HxType,
): HxType | undefined {
  const symbol = type.symbol;
  if (!isLibSymbol(symbol) || !(symbol.flags & ts.SymbolFlags.Interface)) {
    return undefined;
  }
  const value = () => {
    const [first] = checker.getTypeArguments(type as ts.TypeReference);
    return first ? map(first) : DYNAMIC;
  };
  if (symbol.name === 'Generator') return generatorType(value());
  if (ITERABLE_NAMES.has(symbol.name)) return jsIterableType(value());
  return undefined;
}

function pathParams(type: HxType, path: HxTypePath): HxType[] | undefined {
  const inner = type.kind === 'null' ? type.inner : type;
  return inner.kind === 'path' &&
    inner.path.pack.join('.') === path.pack.join('.') &&
    inner.path.module === path.module &&
    inner.path.name === path.name
    ? inner.params
    : undefined;
}

/** Element type of a `ts2hx.Generator<T>` or `ts2hx.JsIterable<T>`, or `undefined` for other types. */
export function lazyIterableElement(type: HxType): HxType | undefined {
  const params =
    pathParams(type, RUNTIME.generator) ?? pathParams(type, RUNTIME.jsIterable);
  return params ? (params[0] ?? DYNAMIC) : undefined;
}

/** Whether a TS type has a `[Symbol.iterator]` member. */
export function hasIteratorMember(type: ts.Type): boolean {
  return type
    .getProperties()
    .some((p) => String(p.escapedName).startsWith('__@iterator@'));
}

/** The values a generator or iterator yields, drained into a fresh `Array<T>`. */
export function lazyIterableArray(expr: HxExpr): HxExpr | undefined {
  const element = lazyIterableElement(expr.type);
  if (!element) return undefined;
  return {
    kind: 'call',
    callee: { kind: 'field', target: expr, name: 'toArray', type: DYNAMIC },
    args: [],
    type: arrayType(element),
    pos: expr.pos,
  };
}

/** The values any iterable yields, as `Array<Dynamic>` (copied element by element where typed). */
export function iterableArray(expr: HxExpr): HxExpr {
  return staticCall(
    RUNTIME.iter,
    'toArray',
    [expr],
    arrayType(DYNAMIC),
    expr.pos,
  );
}

function generatorMethod(name: string, haxeName: string): CallBinding {
  return ({ receiver, args, pos, spreadLast }) =>
    receiver &&
    !spreadLast &&
    args.length <= 1 &&
    lazyIterableElement(receiver.expr.type)
      ? method(receiver.expr, haxeName, args, pos)
      : undefined;
}

function method(
  target: HxExpr,
  name: string,
  args: HxExpr[],
  pos?: SourcePos,
): HxExpr {
  return {
    kind: 'call',
    callee: { kind: 'field', target, name, type: DYNAMIC, pos },
    args,
    type: DYNAMIC,
    pos,
  };
}

/** `Array.from(iterable)` over a generator, an iterator or a class with `[Symbol.iterator]()`. */
const fromIterable: CallBinding = ({ args, argTypes, type, spreadLast }) => {
  const [source] = args;
  if (!source || args.length !== 1 || spreadLast) return undefined;
  const lazy = lazyIterableArray(source);
  if (lazy) return lazy;
  if (!hasIteratorMember(argTypes[0])) return undefined;
  return { kind: 'cast', expr: iterableArray(source), checked: false, type };
};

/** Generator methods (`return`/`throw` are Haxe keywords) and `Array.from` of iterables. */
export const ITERABLE_CALL_BINDINGS: ReadonlyArray<[string, CallBinding]> = [
  ['Generator.next', generatorMethod('next', 'next')],
  ['Generator.return', generatorMethod('return', 'doReturn')],
  ['Generator.throw', generatorMethod('throw', 'doThrow')],
  ['Iterator.next', generatorMethod('next', 'next')],
  ['ArrayConstructor.from', fromIterable],
];
