import {
  cast,
  dynamic,
  untyped,
  macro,
  operator,
  overload,
  final,
  cases,
} from './lib/inline';
import { Square, MAX, $value, _value, Shape, __init } from './lib/upper';
import { Counter } from './lib/counter';
import { value as classValue } from './class/default';
import { max as stringMax } from './string';
import * as math from './math';

function inline(cast: number, dynamic: string): string {
  const untyped = cast * 2;
  return dynamic + untyped;
}

function shadow(lib: number): number {
  const cases = lib + 1;
  return cases;
}

console.log(cast(2), dynamic, untyped(), macro, operator, overload, final);
console.log(Square(4), MAX, $value, _value, Shape('box'), __init());
console.log(Counter(), Counter(), classValue, stringMax('ab', 'b'));
console.log(math.max(1, 5), Math.max(3, 9), inline(5, 'n'), cases, shadow(1));
