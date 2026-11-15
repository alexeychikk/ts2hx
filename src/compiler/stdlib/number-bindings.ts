import ts from 'typescript';

import {
  BOOL,
  constExpr,
  FLOAT,
  HX_MATH,
  RUNTIME,
  staticCall,
  STRING,
} from '../ir/builders';
import type { HxExpr, HxType, HxTypePath, SourcePos } from '../ir/types';
import type { CallBinding, ValueBinding } from './bindings';

function isNumberLike(type: ts.Type): boolean {
  return type.isUnion()
    ? type.types.every(isNumberLike)
    : (type.flags & ts.TypeFlags.NumberLike) !== 0;
}

function isStringLike(type: ts.Type): boolean {
  return type.isUnion()
    ? type.types.every(isStringLike)
    : (type.flags & ts.TypeFlags.StringLike) !== 0;
}

/** A fixed-arity `Math` function: missing arguments are `undefined`, i.e. `NaN`. */
function mathFunction(
  owner: HxTypePath,
  name: string,
  arity: number,
): CallBinding {
  return ({ args, pos, spreadLast }) => {
    if (spreadLast || args.length > arity) return undefined;
    const padded = [...args];
    while (padded.length < arity) padded.push(constExpr(NaN, pos));
    return staticCall(owner, name, padded, FLOAT, pos);
  };
}

/** `Math.max(…)`-style: plain arguments, or one spread array (the frontend folds any mix into one). */
function variadicMath(name: string): CallBinding {
  return ({ args, pos, spreadLast }) =>
    spreadLast && args.length !== 1
      ? undefined
      : { ...staticCall(RUNTIME.jsMath, name, args, FLOAT, pos), spreadLast };
}

/** `x.name(args)` → `Num.name(x, args)` with at most `maxArgs` arguments. */
function numberMethod(
  name: string,
  type: HxType,
  maxArgs: number,
): CallBinding {
  return ({ receiver, args, pos, spreadLast }) =>
    receiver && !spreadLast && args.length <= maxArgs
      ? staticCall(RUNTIME.num, name, [receiver.expr, ...args], type, pos)
      : undefined;
}

const numberToString: CallBinding = ({ receiver, args, pos, spreadLast }) => {
  if (!receiver || spreadLast || args.length > 1) return undefined;
  return args.length === 0
    ? staticCall(RUNTIME.num, 'toString', [receiver.expr], STRING, pos)
    : staticCall(
        RUNTIME.num,
        'toStringRadix',
        [receiver.expr, args[0]],
        STRING,
        pos,
      );
};

/** `parseInt`/`parseFloat`: the first argument goes through `String()`. */
function parse(name: string, maxArgs: number): CallBinding {
  return ({ args, argTypes, pos, spreadLast, toJsString }) =>
    spreadLast || args.length === 0 || args.length > maxArgs
      ? undefined
      : staticCall(
          RUNTIME.num,
          name,
          [toJsString(args[0], argTypes[0]), ...args.slice(1)],
          FLOAT,
          pos,
        );
}

/** A `Number.isX(x)` predicate on a number; other argument types are left unsupported. */
function numberPredicate(owner: HxTypePath, name: string): CallBinding {
  return ({ args, argTypes, pos, spreadLast }) =>
    !spreadLast && args.length === 1 && isNumberLike(argTypes[0])
      ? staticCall(owner, name, args, BOOL, pos)
      : undefined;
}

/** Global `isNaN`/`isFinite`: a string argument is converted with `Number()` first. */
function globalPredicate(name: string): CallBinding {
  return ({ args, argTypes, pos, spreadLast }) => {
    if (spreadLast || args.length !== 1) return undefined;
    if (isNumberLike(argTypes[0])) {
      return staticCall(HX_MATH, name, args, BOOL, pos);
    }
    return isStringLike(argTypes[0])
      ? staticCall(
          HX_MATH,
          name,
          [staticCall(RUNTIME.num, 'fromString', args, FLOAT, pos)],
          BOOL,
          pos,
        )
      : undefined;
  };
}

const valueOf: CallBinding = ({ receiver, args }) =>
  receiver && args.length === 0 ? receiver.expr : undefined;

const HAXE_MATH_FUNCTIONS: Array<[string, number]> = [
  ['abs', 1],
  ['sqrt', 1],
  ['exp', 1],
  ['log', 1],
  ['sin', 1],
  ['cos', 1],
  ['tan', 1],
  ['asin', 1],
  ['acos', 1],
  ['atan', 1],
  ['atan2', 2],
  ['random', 0],
];

const JS_MATH_FUNCTIONS: Array<[string, number]> = [
  ['round', 1],
  ['floor', 1],
  ['ceil', 1],
  ['trunc', 1],
  ['sign', 1],
  ['cbrt', 1],
  ['log10', 1],
  ['log2', 1],
  ['log1p', 1],
  ['expm1', 1],
  ['sinh', 1],
  ['cosh', 1],
  ['tanh', 1],
  ['asinh', 1],
  ['acosh', 1],
  ['atanh', 1],
  ['fround', 1],
  ['imul', 2],
  ['clz32', 1],
];

/** `Math.*`, `Number.prototype.*`, `Number.*` and the global number functions (ADR 0005). */
export const NUMBER_CALL_BINDINGS: Array<[string, CallBinding]> = [
  ...HAXE_MATH_FUNCTIONS.map(([name, arity]): [string, CallBinding] => [
    `Math.${name}`,
    mathFunction(HX_MATH, name, arity),
  ]),
  ...JS_MATH_FUNCTIONS.map(([name, arity]): [string, CallBinding] => [
    `Math.${name}`,
    mathFunction(RUNTIME.jsMath, name, arity),
  ]),
  ['Math.pow', mathFunction(RUNTIME.num, 'pow', 2)],
  ['Math.max', variadicMath('max')],
  ['Math.min', variadicMath('min')],
  ['Math.hypot', variadicMath('hypot')],
  ['Number.toString', numberToString],
  ['Number.toFixed', numberMethod('toFixed', STRING, 1)],
  ['Number.toPrecision', numberMethod('toPrecision', STRING, 1)],
  ['Number.toExponential', numberMethod('toExponential', STRING, 1)],
  ['Number.valueOf', valueOf],
  ['parseInt', parse('parseInt', 2)],
  ['NumberConstructor.parseInt', parse('parseInt', 2)],
  ['parseFloat', parse('parseFloat', 1)],
  ['NumberConstructor.parseFloat', parse('parseFloat', 1)],
  ['isNaN', globalPredicate('isNaN')],
  ['isFinite', globalPredicate('isFinite')],
  ['NumberConstructor.isNaN', numberPredicate(HX_MATH, 'isNaN')],
  ['NumberConstructor.isFinite', numberPredicate(HX_MATH, 'isFinite')],
  ['NumberConstructor.isInteger', numberPredicate(RUNTIME.num, 'isInteger')],
  [
    'NumberConstructor.isSafeInteger',
    numberPredicate(RUNTIME.num, 'isSafeInteger'),
  ],
];

function constant(value: number): ValueBinding {
  return (pos?: SourcePos): HxExpr => constExpr(value, pos);
}

const MATH_CONSTANTS = [
  'E',
  'LN10',
  'LN2',
  'LOG10E',
  'LOG2E',
  'PI',
  'SQRT1_2',
  'SQRT2',
] as const;

const NUMBER_CONSTANTS = [
  'MAX_SAFE_INTEGER',
  'MIN_SAFE_INTEGER',
  'MAX_VALUE',
  'MIN_VALUE',
  'EPSILON',
  'POSITIVE_INFINITY',
  'NEGATIVE_INFINITY',
  'NaN',
] as const;

/** `Math` and `Number` constants, inlined as literals. */
export const NUMBER_VALUE_BINDINGS: Array<[string, ValueBinding]> = [
  ...MATH_CONSTANTS.map((name): [string, ValueBinding] => [
    `Math.${name}`,
    constant(Math[name]),
  ]),
  ...NUMBER_CONSTANTS.map((name): [string, ValueBinding] => [
    `NumberConstructor.${name}`,
    constant(Number[name]),
  ]),
];
