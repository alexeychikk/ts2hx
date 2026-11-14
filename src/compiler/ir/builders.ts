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

export const HX_MATH = typePath([], 'Math');

/** Paths of the `ts2hx` runtime package (`runtime/ts2hx/`). */
export const RUNTIME = {
  ts2hx: typePath(['ts2hx'], 'Ts2hx'),
  console: typePath(['ts2hx'], 'Console'),
  num: typePath(['ts2hx'], 'Num'),
  eventLoop: typePath(['ts2hx'], 'EventLoop'),
};

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

function isStdType(type: HxType, name: string): boolean {
  return (
    type.kind === 'path' &&
    type.path.pack.length === 0 &&
    type.path.name === name
  );
}
