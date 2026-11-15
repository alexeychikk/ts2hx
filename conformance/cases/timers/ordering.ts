// Node starts the script's timers from a cached loop time that a slow start leaves
// behind, so timers created in callbacks are kept 100 ms away from any other.
console.log('start');

setTimeout(() => console.log('t 0 is 1'), 0);
setTimeout(() => console.log('t 1'), 1);
setTimeout(() => console.log('t negative is 1'), -10);

const cancelled = setTimeout(() => console.log('never'), 2);
clearTimeout(cancelled);
clearTimeout(undefined);

setTimeout(() => {
  console.log('outer 100');
  Promise.resolve().then(() => console.log('micro inside timer'));
  queueMicrotask(() => console.log('queued inside timer'));
  setTimeout(() => console.log('nested 0 after outer 100'), 0);
}, 100);
setTimeout(() => console.log('second 100 runs after micro'), 100);

setTimeout(() => console.log('t 500 a'), 500);
setTimeout(() => console.log('t 500 b'), 500);
setTimeout(() => console.log('t 1400'), 1400);

let ticks = 0;
const interval = setInterval(() => {
  ticks++;
  console.log('interval', ticks);
  if (ticks === 3) {
    clearInterval(interval);
    console.log('interval cleared');
  }
}, 350);

setTimeout((a: string, b: number) => console.log('args', a, b), 850, 'x', 2);

function countdown(n: number): void {
  if (n === 0) {
    console.log('liftoff');
    return;
  }
  console.log('count', n);
  setTimeout(() => countdown(n - 1), 200);
}
countdown(3);

Promise.resolve().then(() => {
  console.log('micro before timers');
  setTimeout(() => console.log('timer from micro'), 0);
});

const self = setTimeout(() => {
  console.log('clearing itself');
  clearTimeout(self);
}, 5);

console.log('end');
