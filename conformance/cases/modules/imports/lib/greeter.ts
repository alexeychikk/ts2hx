import { log } from './log';

log('greeter initialised');

export const VERSION = '1.0';

export function greet(name: string): string {
  return `hello, ${name}`;
}
