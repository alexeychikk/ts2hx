import ts from 'typescript';

import {
  arrayType,
  BOOL,
  constExpr,
  dictValue,
  DYNAMIC,
  FLOAT,
  HX_MATH,
  INT,
  isFloatType,
  isIntType,
  RUNTIME,
  staticCall,
  STRING,
  typePath,
  VOID,
} from '../ir/builders';
import type { HxExpr, HxType, SourcePos } from '../ir/types';
import {
  ARRAY_CALL_BINDINGS,
  ITERATOR_CALL_BINDINGS,
  ITERATOR_PROPERTY_BINDINGS,
} from './array-bindings';
import { ERROR_CALL_BINDINGS, ERROR_PROPERTY_BINDINGS } from './errors';
import { NUMBER_CALL_BINDINGS, NUMBER_VALUE_BINDINGS } from './number-bindings';
import { STRING_CALL_BINDINGS } from './string-bindings';

/** The object a method is called on (`console` in `console.log(x)`). */
export interface BoundReceiver {
  /** Binding key of the receiver when it is a plain reference to a lib value. */
  libKey?: string;
  /** The converted receiver; a binding that uses it keeps its side effects. */
  expr: HxExpr;
}

/**
 * What a call binding gets from the frontend: converted arguments and their TS types.
 * A binding returns `undefined` for a receiver it does not consume, so its side effects are never dropped.
 */
export interface BoundCall {
  receiver?: BoundReceiver;
  args: HxExpr[];
  argTypes: ts.Type[];
  pos?: SourcePos;
  /** Converts a value of the given TS type to a JS string (`String(x)` semantics). */
  toJsString: (expr: HxExpr, type: ts.Type) => HxExpr;
  /** The last argument is a spread (`f(...xs)`). */
  spreadLast?: boolean;
  /** Fresh, collision-free local name. */
  freshName: (hint: string) => string;
  /** Haxe type of the call's TS result type. */
  readonly type: HxType;
}

/** A property read on a lib value (`xs.length`), given the converted receiver. */
export type PropertyBinding = (receiver: HxExpr, pos?: SourcePos) => HxExpr;

/** Returns the bound expression, or `undefined` when this call shape is not supported. */
export type CallBinding = (call: BoundCall) => HxExpr | undefined;
export type ValueBinding = (pos?: SourcePos) => HxExpr;

/**
 * Calls to TS lib functions, keyed by the checker's fully qualified name of the
 * callee's symbol (only symbols declared in a lib file are looked up).
 */
export const CALL_BINDINGS: ReadonlyMap<string, CallBinding> = new Map<
  string,
  CallBinding
>([
  [
    'Console.log',
    ({ receiver, args, argTypes, pos }) =>
      receiver?.libKey !== 'console'
        ? undefined
        : staticCall(
            RUNTIME.console,
            'log',
            args.map((arg, i) =>
              argTypes[i].flags & ts.TypeFlags.NumberLike &&
              (isFloatType(arg.type) || isIntType(arg.type))
                ? staticCall(
                    RUNTIME.console,
                    'inspectNumber',
                    [arg],
                    STRING,
                    pos,
                  )
                : arg,
            ),
            VOID,
            pos,
          ),
  ],
  [
    'String',
    ({ receiver, args, argTypes, pos, toJsString }) =>
      receiver
        ? undefined
        : args.length === 0
          ? constExpr('', pos)
          : args.length === 1
            ? toJsString(args[0], argTypes[0])
            : undefined,
  ],
  [
    'Number',
    ({ receiver, args, argTypes, pos }) => {
      if (receiver || args.length > 1) return undefined;
      if (args.length === 0) return constExpr(0, pos);
      if (argTypes[0].flags & ts.TypeFlags.NumberLike) return args[0];
      return argTypes[0].flags & ts.TypeFlags.StringLike
        ? staticCall(RUNTIME.num, 'fromString', [args[0]], FLOAT, pos)
        : undefined;
    },
  ],
  ...NUMBER_CALL_BINDINGS,
  ...STRING_CALL_BINDINGS,
  ...ARRAY_CALL_BINDINGS,
  ...ITERATOR_CALL_BINDINGS,
  ...ERROR_CALL_BINDINGS,
  ['ObjectConstructor.keys', dictEnumeration('keys', () => arrayType(STRING))],
  ['ObjectConstructor.values', dictEnumeration('values', arrayType)],
  [
    'ObjectConstructor.entries',
    dictEnumeration('entries', () => arrayType(arrayType(DYNAMIC))),
  ],
  [
    'ArrayConstructor.isArray',
    ({ args, pos }) =>
      args.length === 1
        ? {
            kind: 'isOfType',
            expr: args[0],
            path: typePath([], 'Array'),
            type: BOOL,
            pos,
          }
        : undefined,
  ],
]);

/** `Object.keys`/`values`/`entries` of a `ts2hx.Dict`: its own ordered enumeration. */
function dictEnumeration(
  name: string,
  resultType: (value: HxType) => HxType,
): CallBinding {
  return ({ receiver, args, pos }) => {
    const value = args.length === 1 ? dictValue(args[0].type) : undefined;
    if (!receiver || receiver.libKey !== 'Object' || value === undefined) {
      return undefined;
    }
    return {
      kind: 'call',
      callee: { kind: 'field', target: args[0], name, type: DYNAMIC, pos },
      args: [],
      type: resultType(value),
      pos,
    };
  };
}

const lengthField: PropertyBinding = (receiver, pos) => ({
  kind: 'field',
  target: receiver,
  name: 'length',
  type: INT,
  pos,
});

/** Lib properties read on a value (`xs.length`). */
export const PROPERTY_BINDINGS: ReadonlyMap<string, PropertyBinding> = new Map([
  ['Array.length', lengthField],
  ['ReadonlyArray.length', lengthField],
  ['String.length', lengthField],
  ...ITERATOR_PROPERTY_BINDINGS,
  ...ERROR_PROPERTY_BINDINGS,
]);

/** Lib values read as plain identifiers or properties (`NaN`, `Infinity`). */
export const VALUE_BINDINGS: ReadonlyMap<string, ValueBinding> = new Map<
  string,
  ValueBinding
>([
  [
    'NaN',
    (pos) => ({
      kind: 'staticField',
      owner: HX_MATH,
      name: 'NaN',
      type: FLOAT,
      pos,
    }),
  ],
  [
    'Infinity',
    (pos) => ({
      kind: 'staticField',
      owner: HX_MATH,
      name: 'POSITIVE_INFINITY',
      type: FLOAT,
      pos,
    }),
  ],
  ...NUMBER_VALUE_BINDINGS,
]);

/** `@types/node` declares the same globals inside namespaces: map them to the lib name. */
const NODE_TYPES_ALIASES: ReadonlyMap<string, string> = new Map([
  ['console.Console.log', 'Console.log'],
  ['global.console', 'console'],
]);

function isLibDeclaration(program: ts.Program, decl: ts.Declaration): boolean {
  const file = decl.getSourceFile();
  return (
    program.isSourceFileDefaultLibrary(file) ||
    /[\\/]node_modules[\\/]@types[\\/]node[\\/]/.test(file.fileName)
  );
}

/** Binding key of a lib symbol, or `undefined` when the symbol is not declared by a lib. */
export function stdlibKey(
  program: ts.Program,
  checker: ts.TypeChecker,
  symbol: ts.Symbol | undefined,
): string | undefined {
  if (!symbol) {
    return undefined;
  }
  const resolved =
    symbol.flags & ts.SymbolFlags.Alias
      ? checker.getAliasedSymbol(symbol)
      : symbol;
  const declarations = resolved.declarations ?? [];
  if (
    declarations.length === 0 ||
    !declarations.every((d) => isLibDeclaration(program, d))
  ) {
    return undefined;
  }
  const name = checker.getFullyQualifiedName(resolved);
  return NODE_TYPES_ALIASES.get(name) ?? name;
}
