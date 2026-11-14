import type { HxModule, HxPass, PassContext } from '../ir/types';
import { lowerCFor } from './lower-c-for';

/** IR → IR lowerings, in order; each later ticket appends its pass here. */
export const PASSES: readonly HxPass[] = [lowerCFor];

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
