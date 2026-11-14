console.log('ops loaded');

export function add(a: number, b: number): number {
  return a + b;
}

export function sub(a: number, b: number): number {
  return a - b;
}

function mul(a: number, b: number): number {
  return a * b;
}

export { mul as times };
