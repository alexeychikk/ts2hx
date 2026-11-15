console.log('script start');

setTimeout(() => console.log('timeout 0'), 0);
setTimeout(() => console.log('timeout 10'), 10);
setTimeout(() => console.log('timeout 1'), 1);

Promise.resolve()
  .then(() => console.log('micro 1'))
  .then(() => console.log('micro 3'));

queueMicrotask(() => console.log('micro 2'));

new Promise<void>((resolve) => {
  console.log('executor runs synchronously');
  resolve();
}).then(() => console.log('micro after executor'));

Promise.reject(new Error('boom'))
  .catch((e: Error) => console.log('caught', e.message))
  .finally(() => console.log('finally'));

const chained = Promise.resolve(1)
  .then((n) => n + 1)
  .then((n) => Promise.resolve(n * 10))
  .then((n) => {
    console.log('adopted', n);
    return String(n);
  });
chained.then((s) => console.log('string', s.length));

Promise.resolve('a').then((v) => console.log('first tick', v));
Promise.resolve(Promise.resolve('b')).then((v) =>
  console.log('same promise', v),
);
new Promise<string>((resolve) => resolve(Promise.resolve('c'))).then((v) =>
  console.log('adopted later', v),
);

new Promise<number>((resolve, reject) => {
  resolve(1);
  reject(new Error('ignored'));
  resolve(2);
}).then((v) => console.log('settles once', v));

new Promise<number>(() => {
  throw new Error('executor threw');
}).then(
  () => console.log('not reached'),
  (e: Error) => console.log('rejected by throw', e.message),
);

Promise.resolve(5)
  .then((v) => {
    throw new Error(`thrown ${v}`);
  })
  .then(() => console.log('skipped'))
  .catch((e: Error) => {
    console.log('caught later', e.message);
    return 'recovered';
  })
  .then((v) => console.log(v));

Promise.resolve(7)
  .finally(() => console.log('finally keeps value'))
  .then((v) => console.log('after finally', v));

Promise.reject(new Error('kept'))
  .finally(() => 'ignored')
  .catch((e: Error) => console.log('finally keeps reason', e.message));

Promise.resolve(1)
  .finally(() => {
    throw new Error('finally threw');
  })
  .catch((e: Error) => console.log(e.message));

const settled = Promise.resolve('shared');
settled.then((v) => console.log('listener 1', v));
settled.then((v) => console.log('listener 2', v));

console.log('script end');
