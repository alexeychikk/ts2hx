import type { HxExpr, HxParam, HxType } from '../ir/types';

/**
 * A callback literal padded to the `(value, index, array)` arity the runtime
 * calls it with; other callbacks must already take that many arguments.
 */
export function padCallback(
  callback: HxExpr,
  extra: HxType[],
  freshName: (hint: string) => string,
): HxExpr | undefined {
  if (callback.kind === 'fn') {
    const missing = extra.length + 1 - callback.fn.params.length;
    if (missing < 0 || callback.fn.params.some((p) => p.rest)) {
      return undefined;
    }
    const padding: HxParam[] = extra
      .slice(extra.length - missing)
      .map((type) => ({ name: freshName('unused'), type }));
    return {
      ...callback,
      fn: { ...callback.fn, params: [...callback.fn.params, ...padding] },
    };
  }
  return callback.type.kind === 'fn' &&
    callback.type.args.length === extra.length + 1
    ? callback
    : undefined;
}
