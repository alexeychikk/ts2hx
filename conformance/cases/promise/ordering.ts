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

async function asyncFn() {
  console.log('async fn body');
  await undefined;
  console.log('after await');
}
asyncFn();

Promise.reject(new Error('boom'))
  .catch((e: Error) => console.log('caught', e.message))
  .finally(() => console.log('finally'));

console.log('script end');
