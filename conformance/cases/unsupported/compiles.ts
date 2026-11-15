import { readFileSync } from 'fs';

function bigints(): bigint {
  const big = 10n ** 20n;
  return big + BigInt(1);
}

function proxies(): unknown {
  const target = { a: 1 };
  const proxy = new Proxy(target, {
    get: (object, key) => Reflect.get(object, key),
  });
  return [proxy, Reflect.ownKeys(target), Reflect.has(target, 'a')];
}

function evaluation(): unknown {
  const sum = new Function('a', 'b', 'return a + b');
  return [eval('1 + 1'), sum(1, 2)];
}

async function dynamicImport(): Promise<unknown> {
  return import('fs');
}

function weakReferences(): unknown {
  const ref = new WeakRef({ a: 1 });
  const registry = new FinalizationRegistry((held: string) => held.length);
  registry.register({}, 'held');
  return ref.deref();
}

class Base {
  greet(): string {
    return 'base';
  }
}

function prototypes(): unknown {
  const object = {};
  Object.setPrototypeOf(object, Base.prototype);
  (Base.prototype as any).extra = () => 'patched';
  return Object.getPrototypeOf(object);
}

type Constructor = new (...args: any[]) => object;

function Timestamped<T extends Constructor>(Parent: T) {
  return class extends Parent {
    stamp = 1;
  };
}

function mixins(): unknown {
  const Mixed = Timestamped(Base);
  return new Mixed();
}

function intl(): string {
  return new Intl.NumberFormat('en-US').format(1234.5);
}

function dynamicArguments(): number {
  return arguments.length;
}

function nodeBuiltins(): string {
  return readFileSync('/dev/null', 'utf8');
}

const neverCalled = [
  bigints,
  proxies,
  evaluation,
  dynamicImport,
  weakReferences,
  prototypes,
  mixins,
  intl,
  dynamicArguments,
  nodeBuiltins,
];
console.log('compiled', neverCalled.length);
