import ts from 'typescript';

import { arrayType, DYNAMIC, STRING, typePath } from '../ir/builders';
import type { HxType, HxTypePath } from '../ir/types';
import type { CallBinding, PropertyBinding } from './bindings';

/** The JS error classes the `ts2hx.Error` module defines (ADR 0002). */
const ERROR_CLASSES: readonly string[] = [
  'Error',
  'TypeError',
  'RangeError',
  'SyntaxError',
  'ReferenceError',
  'EvalError',
  'URIError',
  'AggregateError',
];

/** Runtime class of a lib error class name (`RangeError` → `ts2hx.Error.RangeError`). */
export function errorClassPath(name: string): HxTypePath | undefined {
  return ERROR_CLASSES.includes(name)
    ? typePath(['ts2hx'], name, 'Error')
    : undefined;
}

/** The fields `ts2hx.Error` declares, which a subclass must not redeclare. */
export const ERROR_FIELD_NAMES: ReadonlySet<string> = new Set([
  'name',
  'message',
  'stack',
  'cause',
]);

/** Runtime class of a lib error class symbol (`RangeError`), `undefined` for other symbols. */
export function libErrorClassPath(symbol: ts.Symbol): HxTypePath | undefined {
  const declarations = symbol.declarations ?? [];
  const isLib =
    declarations.length > 0 &&
    declarations.every((d) => {
      const file = d.getSourceFile();
      return (
        file.hasNoDefaultLib ||
        /[\\/]typescript[\\/]lib[\\/]/.test(file.fileName) ||
        /[\\/]@types[\\/]/.test(file.fileName)
      );
    });
  return isLib ? errorClassPath(symbol.name) : undefined;
}

function isErrorType(type: HxType): boolean {
  return (
    type.kind === 'path' &&
    type.path.pack.join('.') === 'ts2hx' &&
    type.path.module === 'Error'
  );
}

/** `error.toString()` of a `ts2hx.Error`, which implements JS `Error.prototype.toString`. */
const errorToString: CallBinding = ({ receiver, args, pos }) =>
  receiver && args.length === 0 && isErrorType(receiver.expr.type)
    ? {
        kind: 'call',
        callee: {
          kind: 'field',
          target: receiver.expr,
          name: 'toString',
          type: DYNAMIC,
        },
        args: [],
        type: STRING,
        pos,
      }
    : undefined;

/** `Error('…')` called without `new` constructs the error all the same. */
export const ERROR_CALL_BINDINGS: ReadonlyArray<[string, CallBinding]> = [
  ['Object.toString', errorToString],
  ...ERROR_CLASSES.map((name): [string, CallBinding] => {
    const path = typePath(['ts2hx'], name, 'Error');
    const binding: CallBinding = ({ receiver, args, pos, spreadLast }) =>
      receiver || spreadLast
        ? undefined
        : {
            kind: 'new',
            path,
            typeArgs: [],
            args,
            type: { kind: 'path', path, params: [] },
            pos,
          };
    return [name, binding];
  }),
];

/** Binding keys of the JS error properties: plain, writable fields of `ts2hx.Error`. */
export const ERROR_PROPERTIES: ReadonlySet<string> = new Set(
  [...ERROR_FIELD_NAMES].map((name) => `Error.${name}`),
);

const NULLABLE_STRING: HxType = { kind: 'null', inner: STRING };

const errorsField: PropertyBinding = (receiver, pos) => ({
  kind: 'field',
  target: receiver,
  name: 'errors',
  type: arrayType(DYNAMIC),
  pos,
});

/** The JS error properties, plain fields of `ts2hx.Error`. */
export const ERROR_PROPERTY_BINDINGS: ReadonlyArray<[string, PropertyBinding]> =
  (
    [
      ['name', STRING],
      ['message', STRING],
      ['stack', NULLABLE_STRING],
      ['cause', DYNAMIC],
    ] as const
  )
    .map(([name, type]): [string, PropertyBinding] => [
      `Error.${name}`,
      (receiver, pos) => ({ kind: 'field', target: receiver, name, type, pos }),
    ])
    .concat([['AggregateError.errors', errorsField]]);
