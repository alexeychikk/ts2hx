import { b, bTwice } from './b';

console.log('a init, b =', b, bTwice());

export const a = 'A';

export function describeA(): string {
  return 'a sees ' + b;
}

export function aHelper(): string {
  return 'helper from a';
}
