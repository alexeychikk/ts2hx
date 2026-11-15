console.log('script start');

setTimeout(() => console.log('timeout'), 0);

Promise.resolve()
  .then(() => console.log('micro 1'))
  .then(() => console.log('micro 2'))
  .then(() => console.log('micro 3'));

async function asyncFn() {
  console.log('async fn body');
  await undefined;
  console.log('after await');
}
asyncFn();

async function returnsPromise(): Promise<string> {
  return Promise.resolve('returned promise');
}
returnsPromise().then((v) => console.log(v));

console.log('script end');
