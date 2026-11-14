function makeCounter(start: number) {
  let count = start;
  return {
    next: () => ++count,
    reset: () => {
      count = start;
    },
  };
}

const c1 = makeCounter(0);
const c2 = makeCounter(10);
console.log(c1.next(), c1.next(), c2.next());
c1.reset();
console.log(c1.next(), c2.next());

const adders: Array<(x: number) => number> = [];
for (let i = 0; i < 3; i++) {
  adders.push((x) => x + i);
}
console.log(adders.map((f) => f(10)));

function compose<A, B, C>(f: (b: B) => C, g: (a: A) => B): (a: A) => C {
  return (a) => f(g(a));
}
const inc = (x: number) => x + 1;
const double = (x: number) => x * 2;
console.log(compose(inc, double)(5), compose(double, inc)(5));

const fib = (n: number): number => (n < 2 ? n : fib(n - 1) + fib(n - 2));
console.log(fib(15));
