import ts from 'typescript';

import {
  arrayType,
  BOOL,
  DYNAMIC,
  FLOAT,
  RUNTIME,
  sameType,
  staticCall,
  STRING,
  VOID,
} from '../ir/builders';
import type { HxExpr, HxType } from '../ir/types';
import type { BoundCall, CallBinding, PropertyBinding } from './bindings';
import { padCallback, predicateCallback } from './callbacks';

function nonNull(type: HxType): HxType {
  return type.kind === 'null' ? type.inner : type;
}

/** Element type of an `Array<T>`, or `undefined` for other types. */
export function arrayElement(type: HxType): HxType | undefined {
  const inner = nonNull(type);
  return inner.kind === 'path' &&
    inner.path.pack.length === 0 &&
    inner.path.name === 'Array'
    ? (inner.params[0] ?? DYNAMIC)
    : undefined;
}

function nullableOf(type: HxType): HxType {
  return type.kind === 'null' || type.kind === 'dynamic'
    ? type
    : { kind: 'null', inner: type };
}

function asDynamic(expr: HxExpr): HxExpr {
  return expr.type.kind === 'dynamic'
    ? expr
    : { kind: 'cast', expr, checked: false, type: DYNAMIC, pos: expr.pos };
}

/**
 * An inline array literal typed by its own elements: Haxe would otherwise type it
 * against the runtime's `Array<T>` and C# would cast it to the raw `Array`.
 */
function fixedLiteral(expr: HxExpr): HxExpr {
  return expr.kind === 'arrayLit'
    ? { kind: 'cast', expr, checked: false, type: expr.type, pos: expr.pos }
    : expr;
}

/**
 * Arguments the runtime types `T`. On an `Array<Dynamic>` Haxe leaves `T` open and
 * binds it from such an argument, so C# casts the array to e.g. `Array<String>`.
 */
function elementArgs(
  args: HxExpr[],
  element: HxType,
  positions: (index: number) => boolean,
): HxExpr[] {
  return element.kind === 'dynamic'
    ? args.map((arg, i) => (positions(i) ? asDynamic(arg) : arg))
    : args;
}

/** A spread array passed into an `Array<Dynamic>`, cast so Haxe binds `T=Dynamic`. */
function spreadElements(args: HxExpr[], element: HxType): HxExpr[] {
  return element.kind === 'dynamic'
    ? args.map((arg) =>
        sameType(arg.type, arrayType(DYNAMIC))
          ? arg
          : {
              kind: 'cast',
              expr: arg,
              checked: false,
              type: arrayType(DYNAMIC),
              pos: arg.pos,
            },
      )
    : args;
}

/** The receiver of an array method, with its element type. */
function arrayReceiver(
  call: BoundCall,
): { expr: HxExpr; type: HxType; element: HxType } | undefined {
  if (!call.receiver) return undefined;
  const expr = call.receiver.expr;
  const element = arrayElement(expr.type);
  return element
    ? { expr: fixedLiteral(expr), type: nonNull(expr.type), element }
    : undefined;
}

const firstArg = (index: number): boolean => index === 0;

type ResultType = (
  receiver: HxType,
  element: HxType,
  call: BoundCall,
) => HxType;

const sameArray: ResultType = (receiver) => receiver;
const fixed =
  (type: HxType): ResultType =>
  () =>
    type;
const maybeElement: ResultType = (_, element) => nullableOf(element);

/**
 * An element read off an `Array<Dynamic>`, cast so Haxe types the call without an
 * expected type: `JsArray.pop(a) ?? 5.0` would otherwise bind `T=Float` from its
 * context, and C# would pop from an `Array<Float>` copy of `a`.
 */
function pinnedElement(call: HxExpr, element: HxType): HxExpr {
  return element.kind === 'dynamic'
    ? { kind: 'cast', expr: call, checked: false, type: DYNAMIC, pos: call.pos }
    : call;
}

/** `a.name(args)` → `JsArray.name(a, args)` with at most `maxArgs` plain arguments. */
function arrayMethod(
  name: string,
  result: ResultType,
  maxArgs: number,
  elementArg: (index: number) => boolean = () => false,
): CallBinding {
  return (call) => {
    const receiver = arrayReceiver(call);
    if (!receiver || call.spreadLast || call.args.length > maxArgs) {
      return undefined;
    }
    const bound = staticCall(
      RUNTIME.jsArray,
      name,
      [receiver.expr, ...elementArgs(call.args, receiver.element, elementArg)],
      result(receiver.type, receiver.element, call),
      call.pos,
    );
    return result === maybeElement
      ? pinnedElement(bound, receiver.element)
      : bound;
  };
}

/** `push`/`unshift`: any number of elements, or one spread array (`push(...xs)`). */
function variadicMethod(name: string): CallBinding {
  return (call) => {
    const receiver = arrayReceiver(call);
    if (!receiver || (call.spreadLast && call.args.length !== 1)) {
      return undefined;
    }
    const items = call.spreadLast
      ? spreadElements(call.args, receiver.element)
      : elementArgs(call.args, receiver.element, () => true);
    return {
      ...staticCall(
        RUNTIME.jsArray,
        name,
        [receiver.expr, ...items],
        FLOAT,
        call.pos,
      ),
      spreadLast: call.spreadLast,
    };
  };
}

/**
 * A method taking a `(value, index, array)` callback and no `thisArg`;
 * `predicate` callbacks are tested for truthiness.
 */
function callbackMethod(
  name: string,
  result: ResultType,
  predicate = false,
): CallBinding {
  return (call) => {
    const receiver = arrayReceiver(call);
    if (!receiver || call.spreadLast || call.args.length !== 1) {
      return undefined;
    }
    const padded = padCallback(
      call.args[0],
      receiver.element,
      [FLOAT, receiver.type],
      call.freshName,
    );
    if (!padded) return undefined;
    const bound = staticCall(
      RUNTIME.jsArray,
      name,
      [receiver.expr, predicate ? predicateCallback(padded) : padded],
      result(receiver.type, receiver.element, call),
      call.pos,
    );
    return result === maybeElement
      ? pinnedElement(bound, receiver.element)
      : bound;
  };
}

function callbackResult(call: BoundCall): HxType {
  const callback = call.args[0];
  return callback.type.kind === 'fn' ? callback.type.ret : DYNAMIC;
}

const map: CallBinding = callbackMethod('map', (_receiver, _element, call) =>
  arrayType(callbackResult(call)),
);

/** `reduce`/`reduceRight`, with or without an initial value. */
function reduce(name: string): CallBinding {
  return (call) => {
    const receiver = arrayReceiver(call);
    const { args } = call;
    if (!receiver || call.spreadLast || args.length < 1 || args.length > 2) {
      return undefined;
    }
    const initial = args[1];
    const accumulator = initial ? initial.type : receiver.element;
    const callback = padCallback(
      args[0],
      accumulator,
      [receiver.element, FLOAT, receiver.type],
      call.freshName,
    );
    if (!callback) return undefined;
    return initial
      ? staticCall(
          RUNTIME.jsArray,
          name,
          [receiver.expr, callback, initial],
          accumulator,
          call.pos,
        )
      : staticCall(
          RUNTIME.jsArray,
          `${name}First`,
          [receiver.expr, callback],
          accumulator,
          call.pos,
        );
  };
}

/** `sort(compareFn?)`. */
const sort: CallBinding = (call) => {
  const receiver = arrayReceiver(call);
  if (!receiver || call.spreadLast || call.args.length > 1) return undefined;
  const compare = call.args[0]
    ? padCallback(
        call.args[0],
        receiver.element,
        [receiver.element],
        call.freshName,
      )
    : undefined;
  if (call.args[0] && !compare) return undefined;
  return staticCall(
    RUNTIME.jsArray,
    'sort',
    compare ? [receiver.expr, compare] : [receiver.expr],
    receiver.type,
    call.pos,
  );
};

/** `concat(...items)`: arrays are spliced in, other values appended. */
const concat: CallBinding = (call) => {
  const receiver = arrayReceiver(call);
  if (!receiver || call.spreadLast) return undefined;
  const items: HxExpr[] = [];
  for (const arg of call.args) {
    const element = arrayElement(arg.type);
    if (element && sameType(element, receiver.element)) {
      items.push(arg);
    } else if (sameType(nonNull(arg.type), nonNull(receiver.element))) {
      items.push({
        kind: 'arrayLit',
        elements: [arg],
        type: receiver.type,
        pos: arg.pos,
      });
    } else if (receiver.element.kind === 'dynamic') {
      items.push(
        element
          ? { kind: 'cast', expr: arg, checked: false, type: receiver.type }
          : { kind: 'arrayLit', elements: [arg], type: receiver.type },
      );
    } else {
      return undefined;
    }
  }
  return staticCall(
    RUNTIME.jsArray,
    'concat',
    [receiver.expr, ...items],
    receiver.type,
    call.pos,
  );
};

/** `splice(start?, deleteCount?, ...items)`. */
const splice: CallBinding = (call) => {
  const receiver = arrayReceiver(call);
  if (!receiver || call.spreadLast) return undefined;
  const args =
    call.args.length === 1
      ? [call.args[0], spliceAll(receiver.expr)]
      : elementArgs(call.args, receiver.element, (i) => i >= 2);
  return staticCall(
    RUNTIME.jsArray,
    'splice',
    [receiver.expr, ...args],
    receiver.type,
    call.pos,
  );
};

/** `splice(start)` deletes to the end: a delete count no array reaches. */
function spliceAll(array: HxExpr): HxExpr {
  return {
    kind: 'staticField',
    owner: { pack: [], module: 'Math', name: 'Math' },
    name: 'POSITIVE_INFINITY',
    type: FLOAT,
    pos: array.pos,
  };
}

/** `Array.from(iterable, mapFn?)` on arrays, strings and array-like objects. */
export const arrayFrom: CallBinding = (call) => {
  const { args, argTypes } = call;
  if (call.spreadLast || args.length < 1 || args.length > 2) return undefined;
  const isString = (argTypes[0].flags & ts.TypeFlags.StringLike) !== 0;
  const element = isString ? STRING : arrayElement(args[0].type);
  const source = isString
    ? staticCall(RUNTIME.jsString, 'codePoints', [args[0]], arrayType(STRING))
    : args[0];
  const mapFn = args[1]
    ? padCallback(args[1], element ?? DYNAMIC, [FLOAT], call.freshName)
    : undefined;
  if (args[1] && !mapFn) return undefined;
  const result = mapFn
    ? arrayType(callbackResult({ ...call, args: [mapFn] }))
    : arrayType(element ?? DYNAMIC);
  const name = element ? 'from' : 'fromArrayLike';
  if (!element && argTypes[0].getProperty('length') === undefined) {
    return undefined;
  }
  return staticCall(
    RUNTIME.jsArray,
    name,
    mapFn ? [source, mapFn] : [source],
    result,
    call.pos,
  );
};

/** `Array.of(...items)` and `Array(a, b)`: an array literal. */
function arrayOf(call: BoundCall, type: HxType): HxExpr | undefined {
  if (call.spreadLast) {
    return call.args.length === 1
      ? {
          kind: 'call',
          callee: {
            kind: 'field',
            target: call.args[0],
            name: 'copy',
            type: DYNAMIC,
          },
          args: [],
          type: call.args[0].type,
          pos: call.pos,
        }
      : undefined;
  }
  return { kind: 'arrayLit', elements: call.args, type, pos: call.pos };
}

/** `Array(n)` / `new Array(n)`: `n` empty slots; other arguments are the elements. */
export function arrayConstructor(
  call: BoundCall,
  type: HxType,
): HxExpr | undefined {
  if (
    call.args.length === 1 &&
    !call.spreadLast &&
    call.argTypes[0].flags & ts.TypeFlags.NumberLike
  ) {
    return staticCall(RUNTIME.jsArray, 'ofLength', call.args, type, call.pos);
  }
  return arrayOf(call, type);
}

const iterator = arrayMethod('entries', fixed(DYNAMIC), 0);

const arrayMethods: Array<[string, CallBinding]> = [
  ['at', arrayMethod('at', maybeElement, 1)],
  ['concat', concat],
  ['copyWithin', arrayMethod('copyWithin', sameArray, 3)],
  ['entries', iterator],
  ['keys', arrayMethod('keys', fixed(DYNAMIC), 0)],
  ['values', arrayMethod('values', fixed(DYNAMIC), 0)],
  ['every', callbackMethod('every', fixed(BOOL), true)],
  ['some', callbackMethod('some', fixed(BOOL), true)],
  ['filter', callbackMethod('filter', sameArray, true)],
  ['find', callbackMethod('find', maybeElement, true)],
  ['findIndex', callbackMethod('findIndex', fixed(FLOAT), true)],
  ['findLast', callbackMethod('findLast', maybeElement, true)],
  ['findLastIndex', callbackMethod('findLastIndex', fixed(FLOAT), true)],
  ['fill', arrayMethod('fill', sameArray, 3, firstArg)],
  [
    'flat',
    arrayMethod(
      'flat',
      (_r, _e, call) =>
        arrayElement(call.type) ? nonNull(call.type) : arrayType(DYNAMIC),
      1,
    ),
  ],
  [
    'flatMap',
    callbackMethod('flatMap', (_r, _e, call) => {
      const ret = callbackResult(call);
      return arrayType(arrayElement(ret) ?? ret);
    }),
  ],
  ['forEach', callbackMethod('forEach', fixed(VOID))],
  ['includes', arrayMethod('includes', fixed(BOOL), 2, firstArg)],
  ['indexOf', arrayMethod('indexOf', fixed(FLOAT), 2, firstArg)],
  ['lastIndexOf', arrayMethod('lastIndexOf', fixed(FLOAT), 2, firstArg)],
  ['join', arrayMethod('join', fixed(STRING), 1)],
  ['map', map],
  ['pop', arrayMethod('pop', maybeElement, 0)],
  ['shift', arrayMethod('shift', maybeElement, 0)],
  ['push', variadicMethod('push')],
  ['unshift', variadicMethod('unshift')],
  ['reduce', reduce('reduce')],
  ['reduceRight', reduce('reduceRight')],
  ['reverse', arrayMethod('reverse', sameArray, 0)],
  ['slice', arrayMethod('slice', sameArray, 2)],
  ['sort', sort],
  ['splice', splice],
  ['toString', arrayMethod('toString', fixed(STRING), 0)],
];

/** `Array.prototype` methods and `Array` statics (ADR 0005), keyed like `CALL_BINDINGS`. */
export const ARRAY_CALL_BINDINGS: Array<[string, CallBinding]> = [
  ...arrayMethods.flatMap(([name, binding]): Array<[string, CallBinding]> => [
    [`Array.${name}`, binding],
    [`ReadonlyArray.${name}`, binding],
  ]),
  ['ArrayConstructor.from', arrayFrom],
  ['ArrayConstructor.of', (call) => arrayOf(call, call.type)],
  [
    'Array',
    (call) => (call.receiver ? undefined : arrayConstructor(call, call.type)),
  ],
];

/** `xs.length = n`: truncates or grows the array. */
export function setArrayLength(array: HxExpr, length: HxExpr): HxExpr {
  return staticCall(
    RUNTIME.jsArray,
    'setLength',
    [array, length],
    FLOAT,
    array.pos,
  );
}

/** Iterator protocol results read on a value the runtime typed `Dynamic`. */
const dynamicField =
  (name: string): PropertyBinding =>
  (receiver, pos) => ({
    kind: 'field',
    target: receiver,
    name,
    type: DYNAMIC,
    pos,
  });

export const ITERATOR_PROPERTY_BINDINGS: Array<[string, PropertyBinding]> = [
  'IteratorYieldResult',
  'IteratorReturnResult',
  '',
].flatMap((owner): Array<[string, PropertyBinding]> =>
  ['value', 'done'].map((name) => [
    owner ? `${owner}.${name}` : name,
    dynamicField(name),
  ]),
);

/** `it.next()` on an iterator the runtime returned. */
export const ITERATOR_CALL_BINDINGS: Array<[string, CallBinding]> = [
  [
    'Iterator.next',
    ({ receiver, args, pos }) =>
      receiver && args.length === 0
        ? {
            kind: 'call',
            callee: {
              kind: 'field',
              target: receiver.expr,
              name: 'next',
              type: DYNAMIC,
              pos,
            },
            args: [],
            type: DYNAMIC,
            pos,
          }
        : undefined,
  ],
];
