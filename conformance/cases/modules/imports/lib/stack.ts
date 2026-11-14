import { log } from './log';

log('stack initialised');

const items: number[] = [];

export default function push(item: number): number {
  items.push(item);
  return items.length;
}

export function peek(): number {
  return items[items.length - 1];
}

export function size(): number {
  return items.length;
}
