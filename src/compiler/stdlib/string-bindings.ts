import ts from 'typescript';

import {
  arrayType,
  BOOL,
  FLOAT,
  RUNTIME,
  staticCall,
  STRING,
} from '../ir/builders';
import type { HxExpr, HxType } from '../ir/types';
import type { BoundCall, CallBinding } from './bindings';
import { padCallback } from './callbacks';

const NULLABLE_STRING: HxType = { kind: 'null', inner: STRING };
const NULLABLE_FLOAT: HxType = { kind: 'null', inner: FLOAT };

function isStringLike(type: ts.Type): boolean {
  return type.isUnion()
    ? type.types.every(isStringLike)
    : (type.flags & ts.TypeFlags.StringLike) !== 0;
}

/** Arguments the binding requires to be strings (a `RegExp` pattern is not handled here). */
function stringsAt(call: BoundCall, indices: number[]): boolean {
  return indices.every(
    (i) => i >= call.args.length || isStringLike(call.argTypes[i]),
  );
}

/**
 * `s.name(args)` → `JsString.name(s, args)`. `maxArgs` caps the arguments the
 * runtime takes; `strings` lists the argument positions that must be strings.
 */
function stringMethod(
  name: string,
  type: HxType,
  maxArgs: number,
  strings: number[] = [],
): CallBinding {
  return (call) => {
    const { receiver, args, pos, spreadLast } = call;
    if (
      !receiver ||
      spreadLast ||
      args.length > maxArgs ||
      !stringsAt(call, strings)
    ) {
      return undefined;
    }
    return staticCall(
      RUNTIME.jsString,
      name,
      [receiver.expr, ...args],
      type,
      pos,
    );
  };
}

/** `s.concat(...)`: every argument goes through `String()`. */
const concat: CallBinding = ({
  receiver,
  args,
  argTypes,
  pos,
  spreadLast,
  toJsString,
}) =>
  receiver
    ? {
        ...staticCall(
          RUNTIME.jsString,
          'concat',
          [
            receiver.expr,
            ...args.map((arg, i) =>
              spreadLast && i === args.length - 1
                ? arg
                : toJsString(arg, argTypes[i]),
            ),
          ],
          STRING,
          pos,
        ),
        spreadLast,
      }
    : undefined;

/** `replace`/`replaceAll` with a string pattern and a string or replacer function. */
function replace(name: string): CallBinding {
  return (call) => {
    const { receiver, args, argTypes, pos, spreadLast, freshName } = call;
    if (
      !receiver ||
      spreadLast ||
      args.length !== 2 ||
      !isStringLike(argTypes[0])
    ) {
      return undefined;
    }
    if (isStringLike(argTypes[1])) {
      return staticCall(
        RUNTIME.jsString,
        name,
        [receiver.expr, ...args],
        STRING,
        pos,
      );
    }
    const replacer = padCallback(args[1], STRING, [FLOAT, STRING], freshName);
    return replacer
      ? staticCall(
          RUNTIME.jsString,
          `${name}With`,
          [receiver.expr, args[0], replacer],
          STRING,
          pos,
        )
      : undefined;
  };
}

/** `s.toString()` / `s.valueOf()`: the string itself. */
const identity: CallBinding = ({ receiver, args }) =>
  receiver && args.length === 0 ? receiver.expr : undefined;

/** `String.fromCharCode(...)` and `String.fromCodePoint(...)`. */
function variadicStatic(name: string): CallBinding {
  return ({ args, pos, spreadLast }) => ({
    ...staticCall(RUNTIME.jsString, name, args, STRING, pos),
    spreadLast,
  });
}

const stringMethods: Array<[string, CallBinding]> = [
  ['at', stringMethod('at', NULLABLE_STRING, 1)],
  ['charAt', stringMethod('charAt', STRING, 1)],
  ['charCodeAt', stringMethod('charCodeAt', FLOAT, 1)],
  ['codePointAt', stringMethod('codePointAt', NULLABLE_FLOAT, 1)],
  ['concat', concat],
  ['endsWith', stringMethod('endsWith', BOOL, 2, [0])],
  ['startsWith', stringMethod('startsWith', BOOL, 2, [0])],
  ['includes', stringMethod('includes', BOOL, 2, [0])],
  ['indexOf', stringMethod('indexOf', FLOAT, 2, [0])],
  ['lastIndexOf', stringMethod('lastIndexOf', FLOAT, 2, [0])],
  ['localeCompare', stringMethod('localeCompare', FLOAT, 1, [0])],
  ['normalize', stringMethod('normalize', STRING, 1, [0])],
  ['padEnd', stringMethod('padEnd', STRING, 2, [1])],
  ['padStart', stringMethod('padStart', STRING, 2, [1])],
  ['repeat', stringMethod('repeat', STRING, 1)],
  ['replace', replace('replace')],
  ['replaceAll', replace('replaceAll')],
  ['slice', stringMethod('slice', STRING, 2)],
  ['split', stringMethod('split', arrayType(STRING), 2, [0])],
  ['substring', stringMethod('substring', STRING, 2)],
  ['substr', stringMethod('substr', STRING, 2)],
  ['toLowerCase', stringMethod('toLowerCase', STRING, 0)],
  ['toUpperCase', stringMethod('toUpperCase', STRING, 0)],
  ['toLocaleLowerCase', stringMethod('toLowerCase', STRING, 0)],
  ['toLocaleUpperCase', stringMethod('toUpperCase', STRING, 0)],
  ['toString', identity],
  ['valueOf', identity],
  ['trim', stringMethod('trim', STRING, 0)],
  ['trimStart', stringMethod('trimStart', STRING, 0)],
  ['trimEnd', stringMethod('trimEnd', STRING, 0)],
  ['trimLeft', stringMethod('trimStart', STRING, 0)],
  ['trimRight', stringMethod('trimEnd', STRING, 0)],
];

/** `String.prototype` methods and `String` statics (ADR 0005), keyed like `CALL_BINDINGS`. */
export const STRING_CALL_BINDINGS: Array<[string, CallBinding]> = [
  ...stringMethods.map(([name, binding]): [string, CallBinding] => [
    `String.${name}`,
    binding,
  ]),
  ['StringConstructor.fromCharCode', variadicStatic('fromCharCode')],
  ['StringConstructor.fromCodePoint', variadicStatic('fromCodePoint')],
];

/** `JsString.index(s, i)`: JS `s[i]`, `undefined` out of range. */
export function stringIndex(target: HxExpr, index: HxExpr): HxExpr {
  return staticCall(
    RUNTIME.jsString,
    'index',
    [target, index],
    NULLABLE_STRING,
    target.pos,
  );
}

/** The code points `for…of` and spread iterate on a string. */
export function stringCodePoints(target: HxExpr): HxExpr {
  return staticCall(
    RUNTIME.jsString,
    'codePoints',
    [target],
    arrayType(STRING),
    target.pos,
  );
}
