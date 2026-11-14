import { greet, VERSION } from './lib/greeter';
import Stack from './lib/stack';
import * as math from './lib/math';

console.log('main starts');
console.log(greet('modules'), VERSION);
const stack = new Stack<number>();
stack.push(math.square(3));
stack.push(math.cube(2));
console.log(stack.pop(), stack.size(), math.PI_ISH);
