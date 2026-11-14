function capturesEarlierConst(): number {
  const base = 10;
  function add(n: number): number {
    return base + n;
  }
  return add(1);
}
console.log(capturesEarlierConst());

function mutualRecursion(n: number): string {
  function isEven(k: number): boolean {
    return k === 0 ? true : isOdd(k - 1);
  }
  function isOdd(k: number): boolean {
    return k === 0 ? false : isEven(k - 1);
  }
  return `${n}: even=${isEven(n)} odd=${isOdd(n)}`;
}
console.log(mutualRecursion(7));
console.log(mutualRecursion(10));

function calledBeforeDeclaration(): number {
  const first = twice(3);
  function twice(n: number): number {
    return helper(n) * 2;
  }
  function helper(n: number): number {
    return n + 1;
  }
  return first + twice(0);
}
console.log(calledBeforeDeclaration());

function capturesLaterConst(): string {
  function greet(): string {
    return `${greeting}, ${name}`;
  }
  const greeting = 'hello';
  const name = 'world';
  return greet();
}
console.log(capturesLaterConst());

function recursive(n: number): number {
  function factorial(k: number): number {
    return k <= 1 ? 1 : k * factorial(k - 1);
  }
  return factorial(n);
}
console.log(recursive(5));

function inNestedBlock(flag: boolean): number {
  let total = 0;
  if (flag) {
    total += inc(total);
    function inc(n: number): number {
      return n + 5;
    }
    total += inc(total);
  }
  return total;
}
console.log(inNestedBlock(true));
console.log(inNestedBlock(false));

function passedAsValue(): number {
  const apply = (f: (n: number) => number, n: number) => f(n);
  const value = apply(square, 4);
  function square(n: number): number {
    return n * n;
  }
  return value;
}
console.log(passedAsValue());

function shorthandBeforeDeclaration(): number {
  const handlers = { onTick };
  function onTick(): number {
    return 1;
  }
  return handlers.onTick();
}
console.log(shorthandBeforeDeclaration());

function shorthandCapturesLaterConst(): string {
  function make(): { label: string } {
    return { label };
  }
  const label = 'x';
  return make().label;
}
console.log(shorthandCapturesLaterConst());

function readBeforeCapturedConst(): number {
  const holder = { run: f };
  const x = 1;
  function f(): number {
    return x;
  }
  return holder.run() + x;
}
console.log(readBeforeCapturedConst());

function reachedThroughAnotherFunction(): number {
  const g = h();
  const y = 2;
  function h(): () => number {
    return k;
  }
  function k(): number {
    return y;
  }
  return g() * 10 + y;
}
console.log(reachedThroughAnotherFunction());
