type shape = { kind: string };

export const MAX = 10;
export const $value = 'dollar';
export const _value = 'underscore';

export function Square(x: number): number {
  return Math.min(x * x, MAX * MAX);
}

export function Shape(kind: string): string {
  const s: shape = { kind };
  return 'shape:' + s.kind;
}

export function __init(): string {
  return 'not the module init';
}
