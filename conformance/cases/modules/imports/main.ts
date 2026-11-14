import { greet, VERSION } from './lib/greeter';
import push, { peek as top, size } from './lib/stack';
import * as math from './lib/math';
import snapshot, { count } from './lib/counter';

console.log('main starts');
console.log(greet('modules'), VERSION);
push(math.square(3));
console.log(push(math.cube(2)));
const apply = math.square;
console.log(top(), size(), math.PI_ISH, apply(4));
console.log(snapshot, count);
