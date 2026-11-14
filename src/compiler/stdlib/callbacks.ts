import { BOOL, isBoolType, RUNTIME, staticCall } from '../ir/builders';
import type { HxExpr, HxParam, HxType } from '../ir/types';

/** Callback references a wrapper may evaluate on every call without changing behaviour. */
function isStableReference(expr: HxExpr): boolean {
  switch (expr.kind) {
    case 'local':
    case 'staticField':
      return true;
    case 'field':
      return (
        expr.target.kind === 'local' ||
        expr.target.kind === 'this' ||
        expr.target.kind === 'typeRef'
      );
    default:
      return false;
  }
}

/**
 * A callback adapted to the `(first, ...extra)` arity the runtime calls it with:
 * a literal gets unused parameters appended, a reference to a function taking
 * fewer parameters is wrapped in a function that drops the extra arguments.
 */
export function padCallback(
  callback: HxExpr,
  first: HxType,
  extra: HxType[],
  freshName: (hint: string) => string,
): HxExpr | undefined {
  const all = [first, ...extra];
  if (callback.kind === 'fn') {
    const missing = all.length - callback.fn.params.length;
    if (missing < 0 || callback.fn.params.some((p) => p.rest)) {
      return undefined;
    }
    const padding: HxParam[] = all
      .slice(all.length - missing)
      .map((type) => ({ name: freshName('unused'), type }));
    return {
      ...callback,
      fn: { ...callback.fn, params: [...callback.fn.params, ...padding] },
    };
  }
  const type = callback.type;
  if (type.kind !== 'fn' || type.args.some((a) => a.rest)) {
    return undefined;
  }
  const arity = extra.length + 1;
  if (type.args.length === arity) {
    return callback;
  }
  if (type.args.length > arity || !isStableReference(callback)) {
    return undefined;
  }
  const params: HxParam[] = all.map((paramType, i) => ({
    name: freshName(i < type.args.length ? 'arg' : 'unused'),
    type: type.args[i]?.type ?? paramType,
  }));
  const call: HxExpr = {
    kind: 'call',
    callee: callback,
    args: type.args.map((_, i) => ({
      kind: 'local',
      name: params[i].name,
      type: params[i].type,
    })),
    type: type.ret,
  };
  return {
    kind: 'fn',
    fn: {
      typeParams: [],
      params,
      ret: type.ret,
      body: [
        isVoid(type.ret)
          ? { kind: 'expr', expr: call }
          : { kind: 'return', value: call },
      ],
    },
    type: {
      kind: 'fn',
      args: params.map((p) => ({ type: p.type })),
      ret: type.ret,
    },
    pos: callback.pos,
  };
}

function isVoid(type: HxType): boolean {
  return (
    type.kind === 'path' &&
    type.path.pack.length === 0 &&
    type.path.name === 'Void'
  );
}

/** A predicate callback: JS tests its result for truthiness, so a non-`Bool` result is wrapped. */
export function predicateCallback(callback: HxExpr): HxExpr {
  const ret = callback.type.kind === 'fn' ? callback.type.ret : undefined;
  return ret && isBoolType(ret)
    ? callback
    : staticCall(
        RUNTIME.jsArray,
        'truthyCallback',
        [callback],
        callback.type.kind === 'fn'
          ? { ...callback.type, ret: BOOL }
          : callback.type,
        callback.pos,
      );
}
