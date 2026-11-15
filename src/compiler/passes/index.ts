import type { HxModule, HxPass, PassContext } from '../ir/types';
import { inferInt } from './infer-int';
import { lowerCFor } from './lower-c-for';
import { lowerControlFlow } from './lower-control-flow';
import { lowerFinally } from './lower-finally';
import { lowerGenerators } from './lower-generators';

/** IR → IR lowerings, in order; each later ticket appends its pass here. */
export const PASSES: readonly HxPass[] = [
  lowerFinally,
  lowerControlFlow,
  inferInt,
  lowerCFor,
  lowerGenerators,
];

export function createPassContext(
  reportUnsupported: PassContext['reportUnsupported'],
): PassContext {
  let counter = 0;
  return {
    freshName: (hint) => `__${hint}${++counter}`,
    reportUnsupported,
  };
}

export function runPasses(
  module: HxModule,
  context: PassContext,
  passes: readonly HxPass[] = PASSES,
): HxModule {
  return passes.reduce((current, pass) => pass(current, context), module);
}
