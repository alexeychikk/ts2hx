console.log('registry loaded');

export const registry: string[] = [];
let counter = 0;

export function nextId(): number {
  counter += 1;
  return counter;
}

export function register(name: string): void {
  registry.push(name);
  console.log('registered', name, 'as', nextId());
}

export const startedWith = registry.length + nextId() * 100;
