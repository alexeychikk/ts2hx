import type { HxExpr, HxType, HxTypePath, SourcePos } from './types';

export function typePath(
  pack: string[],
  name: string,
  module = name,
): HxTypePath {
  return { pack, module, name };
}

function stdType(name: string): HxType {
  return { kind: 'path', path: typePath([], name), params: [] };
}

export const FLOAT = stdType('Float');
export const INT = stdType('Int');
export const STRING = stdType('String');
export const BOOL = stdType('Bool');
export const VOID = stdType('Void');
export const DYNAMIC: HxType = { kind: 'dynamic' };
export const ANY = stdType('Any');

export const HX_MATH = typePath([], 'Math');

/** Paths of the `ts2hx` runtime package (`runtime/ts2hx/`). */
export const RUNTIME = {
  ts2hx: typePath(['ts2hx'], 'Ts2hx'),
  console: typePath(['ts2hx'], 'Console'),
  num: typePath(['ts2hx'], 'Num'),
  eventLoop: typePath(['ts2hx'], 'EventLoop'),
  jsArray: typePath(['ts2hx'], 'JsArray'),
  jsMath: typePath(['ts2hx'], 'JsMath'),
  jsString: typePath(['ts2hx'], 'JsString'),
  dict: typePath(['ts2hx'], 'Dict'),
  error: typePath(['ts2hx'], 'Error'),
  process: typePath(['ts2hx'], 'Process'),
};

export function arrayType(element: HxType): HxType {
  return { kind: 'path', path: typePath([], 'Array'), params: [element] };
}

/** `ts2hx.Dict<V>`: index signatures and `Record<string, V>` (ADR 0002). */
export function dictType(value: HxType): HxType {
  return { kind: 'path', path: RUNTIME.dict, params: [value] };
}

/** Value type of a `ts2hx.Dict<V>`, or `undefined` for other types. */
export function dictValue(type: HxType): HxType | undefined {
  const inner = type.kind === 'null' ? type.inner : type;
  return inner.kind === 'path' &&
    inner.path.pack.join('.') === 'ts2hx' &&
    inner.path.name === 'Dict'
    ? inner.params[0]
    : undefined;
}

/** Whether two Haxe types are the same type. */
export function sameType(a: HxType, b: HxType): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function localExpr(name: string, type: HxType, pos?: SourcePos): HxExpr {
  return { kind: 'local', name, type, pos };
}

export function staticCall(
  owner: HxTypePath,
  name: string,
  args: HxExpr[],
  type: HxType,
  pos?: SourcePos,
): HxExpr {
  return {
    kind: 'call',
    callee: { kind: 'staticField', owner, name, type: DYNAMIC },
    args,
    type,
    pos,
  };
}

export function constExpr(
  value: number | string | boolean | null,
  pos?: SourcePos,
): HxExpr {
  const type =
    typeof value === 'number'
      ? FLOAT
      : typeof value === 'string'
        ? STRING
        : typeof value === 'boolean'
          ? BOOL
          : DYNAMIC;
  return { kind: 'const', value, type, pos };
}

export function unsupportedExpr(
  message: string,
  source: string,
  pos?: SourcePos,
): HxExpr {
  return { kind: 'unsupported', message, source, type: DYNAMIC, pos };
}

export function isStringType(type: HxType): boolean {
  return isStdType(type, 'String');
}

export function isFloatType(type: HxType): boolean {
  return isStdType(type, 'Float');
}

export function isIntType(type: HxType): boolean {
  return isStdType(type, 'Int');
}

export function isBoolType(type: HxType): boolean {
  return isStdType(type, 'Bool');
}

function isStdType(type: HxType, name: string): boolean {
  return (
    type.kind === 'path' &&
    type.path.pack.length === 0 &&
    type.path.name === name
  );
}
