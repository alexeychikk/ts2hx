import { aHelper, describeA } from './a';

console.log('b init:', aHelper());

export const b = 'B';

export function bTwice(): string {
  return b + b;
}

export function late(): string {
  return describeA();
}
