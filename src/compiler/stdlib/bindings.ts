import ts from 'typescript';

import {
  constExpr,
  FLOAT,
  HX_MATH,
  RUNTIME,
  staticCall,
  STRING,
  VOID,
} from '../ir/builders';
import type { HxExpr, SourcePos } from '../ir/types';

/** The object a method is called on (`console` in `console.log(x)`). */
export interface BoundReceiver {
  /** Binding key of the receiver when it is a plain reference to a lib value. */
  libKey?: string;
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
}

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
              argTypes[i].flags & ts.TypeFlags.NumberLike
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
