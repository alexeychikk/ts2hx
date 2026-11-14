import { isOdd } from './odd';

console.log('even init');

export function isEven(n: number): boolean {
  return n === 0 ? true : isOdd(n - 1);
}
