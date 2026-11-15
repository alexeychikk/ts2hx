import ts from 'typescript';

import {
  arrayType,
  BOOL,
  constExpr,
  dictType,
  DYNAMIC,
  FLOAT,
  INT,
  localExpr,
  RUNTIME,
  staticCall,
  STRING,
  typePath,
} from '../ir/builders';
import type { HxExpr, HxType, HxTypePath, SourcePos } from '../ir/types';
import { arrayFrom } from './array-bindings';
import type { BoundCall, CallBinding, PropertyBinding } from './bindings';
import { isStableReference } from './callbacks';

export const REGEXP_TYPE: HxType = {
  kind: 'path',
  path: RUNTIME.regExp,
  params: [],
};

const ITERATOR_PATH: HxTypePath = typePath(
  ['ts2hx'],
  'RegExpStringIterator',
  'RegExp',
);
const ITERATOR_TYPE: HxType = { kind: 'path', path: ITERATOR_PATH, params: [] };

/** A match result: a plain array of the match and its groups (`index`/`input`/`groups` live in the runtime). */
export const MATCH_TYPE: HxType = arrayType(STRING);

const NULLABLE_MATCH: HxType = { kind: 'null', inner: MATCH_TYPE };
const NULLABLE_GROUPS: HxType = { kind: 'null', inner: dictType(STRING) };

function isLibSymbol(symbol: ts.Symbol): boolean {
  const declarations = symbol.declarations ?? [];
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

/** Haxe type of a lib regex type: `RegExp`, its match arrays and the `matchAll` iterator. */
export function libRegExpType(type: ts.Type): HxType | undefined {
  const symbol = type.symbol;
  if (!symbol || !isLibSymbol(symbol)) {
    return undefined;
  }
  switch (symbol.name) {
    case 'RegExp':
      return REGEXP_TYPE;
    case 'RegExpExecArray':
    case 'RegExpMatchArray':
      return MATCH_TYPE;
    case 'RegExpStringIterator':
      return ITERATOR_TYPE;
    default:
      return undefined;
  }
}

function pathOf(type: HxType): HxTypePath | undefined {
  const inner = type.kind === 'null' ? type.inner : type;
  return inner.kind === 'path' ? inner.path : undefined;
}

function isPath(type: HxType, path: HxTypePath): boolean {
  const actual = pathOf(type);
  return (
    !!actual &&
    actual.pack.join('.') === path.pack.join('.') &&
    actual.name === path.name &&
    (actual.module ?? actual.name) === (path.module ?? path.name)
  );
}

export function isRegExpType(type: HxType): boolean {
  return isPath(type, RUNTIME.regExp);
}

/** Whether a value is the iterator `s.matchAll(re)` returns. */
export function isRegExpIterator(type: HxType): boolean {
  return isPath(type, ITERATOR_PATH);
}

/** The matches a `matchAll` iterator has left, as a fresh array (for spread and `Array.from`). */
export function regExpIteratorArray(iterator: HxExpr): HxExpr {
  return {
    kind: 'call',
    callee: { kind: 'field', target: iterator, name: 'toArray', type: DYNAMIC },
    args: [],
    type: arrayType(MATCH_TYPE),
    pos: iterator.pos,
  };
}

/** A regex literal `/source/flags`. */
export function regExpLiteral(text: string, pos?: SourcePos): HxExpr {
  const end = text.lastIndexOf('/');
  return newRegExp(
    [constExpr(text.slice(1, end), pos), constExpr(text.slice(end + 1), pos)],
    pos,
  );
}

function newRegExp(args: HxExpr[], pos?: SourcePos): HxExpr {
  return {
    kind: 'new',
    path: RUNTIME.regExp,
    typeArgs: [],
    args,
    type: REGEXP_TYPE,
    pos,
  };
}

function isStringLike(type: ts.Type): boolean {
  return type.isUnion()
    ? type.types.every(isStringLike)
    : (type.flags & ts.TypeFlags.StringLike) !== 0;
}

/** `new RegExp(pattern, flags?)` / `RegExp(…)`: a copy for a regex pattern. */
const regExpConstructor: CallBinding = ({
  receiver,
  args,
  argTypes,
  pos,
  spreadLast,
}) => {
  if (
    receiver ||
    spreadLast ||
    args.length < 1 ||
    args.length > 2 ||
    (args.length === 2 && !isStringLike(argTypes[1]))
  ) {
    return undefined;
  }
  if (isRegExpType(args[0].type)) {
    return staticCall(RUNTIME.regExp, 'from', args, REGEXP_TYPE, pos);
  }
  return isStringLike(argTypes[0]) ? newRegExp(args, pos) : undefined;
};

function method(name: string, type: HxType, argCount: number): CallBinding {
  return ({ receiver, args, pos, spreadLast }) =>
    receiver && !spreadLast && args.length === argCount
      ? {
          kind: 'call',
          callee: { kind: 'field', target: receiver.expr, name, type: DYNAMIC },
          args,
          type,
          pos,
        }
      : undefined;
}

const regExpToString: CallBinding = (call) =>
  call.receiver && isRegExpType(call.receiver.expr.type)
    ? method('toString', STRING, 0)(call)
    : undefined;

/** The regex a string method searches with: the `RegExp` argument, or one built from a string argument. */
function patternArg(call: BoundCall, flags?: string): HxExpr | undefined {
  const [pattern] = call.args;
  if (isRegExpType(pattern.type)) return pattern;
  if (!isStringLike(call.argTypes[0])) return undefined;
  return newRegExp(
    flags ? [pattern, constExpr(flags, call.pos)] : [pattern],
    call.pos,
  );
}

/** `s.match(re)` / `s.matchAll(re)` / `s.search(re)`: `RegExp.name(s, re)`. */
function stringSearch(name: string, type: HxType, flags?: string): CallBinding {
  return (call) => {
    const { receiver, args, pos, spreadLast } = call;
    if (!receiver || spreadLast || args.length !== 1) return undefined;
    const pattern = patternArg(call, flags);
    return pattern
      ? staticCall(RUNTIME.regExp, name, [receiver.expr, pattern], type, pos)
      : undefined;
  };
}

/** `s.split(re, limit?)`. */
const split: CallBinding = ({ receiver, args, pos, spreadLast }) =>
  receiver && !spreadLast && args.length >= 1 && args.length <= 2
    ? isRegExpType(args[0].type)
      ? staticCall(
          RUNTIME.regExp,
          'split',
          [receiver.expr, ...args],
          arrayType(STRING),
          pos,
        )
      : undefined
    : undefined;

/** A replacer function adapted to the runtime's `Array<Dynamic> -> String` callback. */
export function replacerCallback(
  callback: HxExpr,
  freshName: (hint: string) => string,
): HxExpr | undefined {
  const type = callback.type;
  if (type.kind !== 'fn' || type.args.some((a) => a.rest)) {
    return undefined;
  }
  const argsName = freshName('args');
  const argsArray = arrayType(DYNAMIC);
  const bound =
    callback.kind === 'fn' || isStableReference(callback)
      ? undefined
      : freshName('replacer');
  const callee = bound ? localExpr(bound, type, callback.pos) : callback;
  const call: HxExpr = {
    kind: 'call',
    callee,
    args: type.args.map((arg, i): HxExpr => ({
      kind: 'cast',
      expr: {
        kind: 'index',
        target: localExpr(argsName, argsArray),
        index: { kind: 'const', value: i, int: true, type: INT },
        type: DYNAMIC,
      },
      checked: false,
      type: arg.type,
    })),
    type: type.ret,
  };
  const wrapper: HxExpr = {
    kind: 'fn',
    fn: {
      typeParams: [],
      params: [{ name: argsName, type: argsArray }],
      ret: STRING,
      body: [{ kind: 'return', value: call }],
    },
    type: { kind: 'fn', args: [{ type: argsArray }], ret: STRING },
    pos: callback.pos,
  };
  if (!bound) {
    return wrapper;
  }
  return {
    kind: 'blockExpr',
    stmts: [{ kind: 'var', name: bound, final: true, init: callback }],
    result: wrapper,
    type: wrapper.type,
    pos: callback.pos,
  };
}

/** `s.replace(re, …)` / `s.replaceAll(re, …)` with a string or a replacer function. */
function replace(name: string): CallBinding {
  return ({ receiver, args, argTypes, pos, spreadLast, freshName }) => {
    if (
      !receiver ||
      spreadLast ||
      args.length !== 2 ||
      !isRegExpType(args[0].type)
    ) {
      return undefined;
    }
    if (isStringLike(argTypes[1])) {
      return staticCall(
        RUNTIME.regExp,
        name,
        [receiver.expr, ...args],
        STRING,
        pos,
      );
    }
    const replacer = replacerCallback(args[1], freshName);
    return replacer
      ? staticCall(
          RUNTIME.regExp,
          `${name}With`,
          [receiver.expr, args[0], replacer],
          STRING,
          pos,
        )
      : undefined;
  };
}

/** `Array.from(s.matchAll(re), mapFn?)`. */
const fromIterator: CallBinding = (call) => {
  const [iterator] = call.args;
  if (!iterator || !isRegExpIterator(iterator.type)) return undefined;
  const matches = regExpIteratorArray(iterator);
  return call.args.length === 1
    ? matches
    : arrayFrom({ ...call, args: [matches, ...call.args.slice(1)] });
};

/** `RegExp` construction and methods, and the `String` methods taking a regex (ADR 0005). */
export const REGEXP_CALL_BINDINGS: Array<[string, CallBinding]> = [
  ['RegExp', regExpConstructor],
  ['RegExpConstructor', regExpConstructor],
  ['RegExp.exec', method('exec', NULLABLE_MATCH, 1)],
  ['RegExp.test', method('test', BOOL, 1)],
  ['RegExp.toString', regExpToString],
  ['Object.toString', regExpToString],
  ['String.match', stringSearch('match', NULLABLE_MATCH)],
  ['String.matchAll', stringSearch('matchAll', ITERATOR_TYPE, 'g')],
  ['String.search', stringSearch('search', FLOAT)],
  ['String.split', split],
  ['String.replace', replace('replace')],
  ['String.replaceAll', replace('replaceAll')],
  ['ArrayConstructor.from', fromIterator],
];

function field(name: string, type: HxType): PropertyBinding {
  return (receiver, pos) => ({
    kind: 'field',
    target: receiver,
    name,
    type,
    pos,
  });
}

function matchProperty(name: string, type: HxType): PropertyBinding {
  return (receiver, pos) =>
    staticCall(RUNTIME.regExp, name, [receiver], type, pos);
}

/** Binding keys of the regex properties a program may assign. */
export const REGEXP_WRITABLE_PROPERTIES: ReadonlySet<string> = new Set([
  'RegExp.lastIndex',
]);

/** `RegExp` properties and the extra properties of match results. */
export const REGEXP_PROPERTY_BINDINGS: Array<[string, PropertyBinding]> = [
  ['RegExp.lastIndex', field('lastIndex', FLOAT)],
  ['RegExp.source', field('source', STRING)],
  ['RegExp.flags', field('flags', STRING)],
  ...[
    'global',
    'ignoreCase',
    'multiline',
    'dotAll',
    'unicode',
    'sticky',
    'hasIndices',
  ].map((name): [string, PropertyBinding] => [
    `RegExp.${name}`,
    field(name, BOOL),
  ]),
  ['RegExpExecArray.index', matchProperty('matchIndex', FLOAT)],
  ['RegExpExecArray.input', matchProperty('matchInput', STRING)],
  ['RegExpExecArray.groups', matchProperty('matchGroups', NULLABLE_GROUPS)],
  [
    'RegExpMatchArray.index',
    matchProperty('matchIndex', { kind: 'null', inner: FLOAT }),
  ],
  [
    'RegExpMatchArray.input',
    matchProperty('matchInput', { kind: 'null', inner: STRING }),
  ],
  ['RegExpMatchArray.groups', matchProperty('matchGroups', NULLABLE_GROUPS)],
];
