import ts from 'typescript';

import {
  arrayType,
  BOOL,
  DYNAMIC,
  RUNTIME,
  staticCall,
  STRING,
} from '../ir/builders';
import type { HxExpr, HxType, SourcePos } from '../ir/types';
import type { CallBinding, ValueBinding } from './bindings';

function processField(name: string, type: HxType): ValueBinding {
  return (pos?: SourcePos): HxExpr => ({
    kind: 'staticField',
    owner: RUNTIME.process,
    name,
    type,
    pos,
  });
}

function isProcessStream(expr: HxExpr): boolean {
  return (
    expr.kind === 'staticField' &&
    expr.owner === RUNTIME.process &&
    (expr.name === 'stdout' || expr.name === 'stderr')
  );
}

/** `process.argv`, `process.stdout` and `process.stderr` (ADR 0005). */
export const PROCESS_VALUE_BINDINGS: ReadonlyArray<[string, ValueBinding]> = [
  ['global.NodeJS.Process.argv', processField('argv', arrayType(STRING))],
  ['global.NodeJS.Process.stdout', processField('stdout', DYNAMIC)],
  ['global.NodeJS.Process.stderr', processField('stderr', DYNAMIC)],
];

/** `process.exit(code)` and `process.stdout.write(text)` / `process.stderr.write(text)`. */
export const PROCESS_CALL_BINDINGS: ReadonlyArray<[string, CallBinding]> = [
  [
    'global.NodeJS.Process.exit',
    ({ receiver, args, type, pos }) =>
      receiver?.libKey === 'process' && args.length <= 1
        ? staticCall(RUNTIME.process, 'exit', args, type, pos)
        : undefined,
  ],
  [
    '"node:net".Socket.write',
    ({ receiver, args, argTypes, pos }) =>
      receiver &&
      args.length === 1 &&
      argTypes[0].flags & ts.TypeFlags.StringLike &&
      isProcessStream(receiver.expr)
        ? staticCall(
            RUNTIME.process,
            'write',
            [receiver.expr, args[0]],
            BOOL,
            pos,
          )
        : undefined,
  ],
];
