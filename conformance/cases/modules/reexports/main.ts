import { add, subtract, times, ZERO, NAME, fmt, twice } from './lib';
import * as lib from './lib';
import answer from './lib/answer';
import label from './lib/label';

console.log('main starts');
console.log(add(2, 3), subtract(5, 1), times(3, 4), ZERO, NAME);
console.log(fmt.wrap('x'), fmt.PREFIX, twice(21));
console.log(lib.add(10, 20), lib.fmt.wrap(lib.NAME), lib.twice(lib.ZERO));
console.log(answer, label);
