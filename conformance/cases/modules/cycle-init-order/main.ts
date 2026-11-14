import { a, describeA } from './a';
import './c';
import { isEven } from './even';
import { x } from './x';

console.log('main', a, describeA());
console.log(isEven(10), isEven(7), x);
