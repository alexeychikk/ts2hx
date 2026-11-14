import { isEven } from './even';

console.log('odd init');

export function isOdd(n: number): boolean {
  return n === 0 ? false : isEven(n - 1);
}
