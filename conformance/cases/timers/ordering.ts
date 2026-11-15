console.log('start');

setTimeout(() => console.log('t 0 is 1'), 0);
setTimeout(() => console.log('t 1'), 1);
setTimeout(() => console.log('t negative is 1'), -10);

const cancelled = setTimeout(() => console.log('never'), 2);
clearTimeout(cancelled);
clearTimeout(undefined);

setTimeout(() => {
  console.log('outer 20');
  Promise.resolve().then(() => console.log('micro inside timer'));
  queueMicrotask(() => console.log('queued inside timer'));
  setTimeout(() => console.log('nested 0 after outer 20'), 0);
}, 20);
setTimeout(() => console.log('second 20 runs after micro'), 20);

setTimeout(() => console.log('t 100 a'), 100);
setTimeout(() => console.log('t 100 b'), 100);
setTimeout(() => console.log('t 240'), 240);

let ticks = 0;
const interval = setInterval(() => {
  ticks++;
  console.log('interval', ticks);
  if (ticks === 3) {
    clearInterval(interval);
    console.log('interval cleared');
  }
}, 70);

setTimeout((a: string, b: number) => console.log('args', a, b), 170, 'x', 2);

function countdown(n: number): void {
  if (n === 0) {
    console.log('liftoff');
    return;
  }
  console.log('count', n);
  setTimeout(() => countdown(n - 1), 40);
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
