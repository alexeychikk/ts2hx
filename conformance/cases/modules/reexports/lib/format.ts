export const PREFIX = '<';

export function wrap(value: string): string {
  return PREFIX + value + '>';
}
