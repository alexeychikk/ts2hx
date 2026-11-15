import {
  arrayType,
  dictValue,
  DYNAMIC,
  RUNTIME,
  staticCall,
  STRING,
} from '../ir/builders';
import type { HxExpr, HxType } from '../ir/types';
import type { CallBinding } from './bindings';

function objectCall(
  name: string,
  arity: (count: number) => boolean,
  build: (args: HxExpr[], type: HxType) => { args: HxExpr[]; type: HxType },
): CallBinding {
  return ({ receiver, args, pos, spreadLast, type }) => {
    if (receiver?.libKey !== 'Object' || spreadLast || !arity(args.length)) {
      return undefined;
    }
    const call = build(args, type);
    return staticCall(RUNTIME.obj, name, call.args, call.type, pos);
  };
}

const single = (count: number) => count === 1;

/** `Object.keys`/`values`/`entries` of a value that is not a dictionary: `Obj` enumerates it in JS key order. */
function enumeration(name: string, resultType: HxType): CallBinding {
  const binding = objectCall(name, single, (args, type) => ({
    args,
    type: name === 'values' ? type : resultType,
  }));
  return (call) =>
    call.args.length === 1 && dictValue(call.args[0].type) !== undefined
      ? undefined
      : binding(call);
}

/** `Object.*` beyond the dictionary enumeration of `bindings.ts` (ADR 0005). */
export const OBJECT_CALL_BINDINGS: ReadonlyArray<[string, CallBinding]> = [
  ['ObjectConstructor.keys', enumeration('keys', arrayType(STRING))],
  ['ObjectConstructor.values', enumeration('values', arrayType(DYNAMIC))],
  [
    'ObjectConstructor.entries',
    enumeration('entries', arrayType(arrayType(DYNAMIC))),
  ],
  [
    'ObjectConstructor.assign',
    objectCall(
      'assign',
      (count) => count >= 1,
      ([target, ...sources], type) => ({
        args: [
          target,
          { kind: 'arrayLit', elements: sources, type: arrayType(DYNAMIC) },
        ],
        type,
      }),
    ),
  ],
  [
    'ObjectConstructor.fromEntries',
    objectCall('fromEntries', single, (args, type) => ({ args, type })),
  ],
  [
    'ObjectConstructor.freeze',
    objectCall('freeze', single, (args) => ({ args, type: args[0].type })),
  ],
];

/** `JSON.stringify(value, replacer?, space?)` / `JSON.parse(text, reviver?)` (ADR 0005). */
export const JSON_CALL_BINDINGS: ReadonlyArray<[string, CallBinding]> = [
  [
    'JSON.stringify',
    ({ receiver, args, pos, spreadLast, type }) =>
      receiver && !spreadLast && args.length >= 1 && args.length <= 3
        ? staticCall(RUNTIME.json, 'stringify', args, type, pos)
        : undefined,
  ],
  [
    'JSON.parse',
    ({ receiver, args, pos, spreadLast, type }) =>
      receiver && !spreadLast && args.length >= 1 && args.length <= 2
        ? staticCall(RUNTIME.json, 'parse', args, type, pos)
        : undefined,
  ],
];
