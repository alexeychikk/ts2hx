import { ts2hx } from '@tests/framework';

test('transforms async arrow functions', async () => {
  await expect(ts2hx`
  const simple = async () => 'result';
  const withReturn = async () => { return 'result'; };
  const withAwait = async () => await somePromise();
  `).resolves.toMatchInlineSnapshot(`
    "final simple = () ->  Promise.resolve('result');
    final withReturn = function () { return  Promise.resolve('result'); };
    final withAwait = () ->  somePromise();
    "
  `);
});

test('transforms variable declarations with await', async () => {
  await expect(ts2hx`
  async function test() {
    const result1 = await somePromise();
    let result2 = await anotherPromise();
    return result1 + result2;
  }
  `).resolves.toMatchInlineSnapshot(`
    "function test() {
        return   somePromise().then(function (result1) {
            return   anotherPromise().then(function (result2) {
                return  Promise.resolve(result1 + result2);
            });
        });
    }
    "
  `);
});

test('transforms if statements with await', async () => {
  await expect(ts2hx`
  async function test(condition: boolean) {
    if (condition) {
      await doSomething();
    } else {
      await doSomethingElse();
    }
    return 'done';
  }
  `).resolves.toMatchInlineSnapshot(`
    "function test(condition:  Bool) {
        return  (condition ?  (function () {
            return   doSomething().then(function (_) {
                return  Promise.resolve();
            });
        })() :  (function () {
            return   doSomethingElse().then(function (_) {
                return  Promise.resolve();
            });
        })()).then(function (_) {
            return  Promise.resolve('done');
        });
    }
    "
  `);
});

test('transforms for loop with await', async () => {
  await expect(ts2hx`
  async function test() {
    for (let i = 0; i < 5; i++) {
      await doSomething(i);
    }
    return 'done';
  }
  `).resolves.toMatchInlineSnapshot(`
    "import ts2hx.AsyncUtils;

    function test() {
        return   AsyncUtils.asyncLoop(0,  5,  function ( i) {
            return   doSomething(i).then(function (_) {
                return  Promise.resolve();
            });
        }).then(function (_) {
            return  Promise.resolve('done');
        });
    }
    "
  `);
});

test('transforms while loop with await', async () => {
  await expect(ts2hx`
  async function test() {
    let condition = true;
    while (condition) {
      condition = await checkCondition();
    }
    return 'done';
  }
  `).resolves.toMatchInlineSnapshot(`
    "import ts2hx.AsyncUtils;

    function test() {
        var condition = true;
        return   AsyncUtils.whileAsync(() -> condition,  function () {
            return   checkCondition().then(function (_awaited) {
                condition = _awaited;
                return  Promise.resolve();
            });
        }).then(function (_) {
            return  Promise.resolve('done');
        });
    }
    "
  `);
});

test('transforms for-of loop with await', async () => {
  await expect(ts2hx`
  async function test(items: string[]) {
    for (const item of items) {
      await processItem(item);
    }
    return 'done';
  }
  `).resolves.toMatchInlineSnapshot(`
    "import ts2hx.AsyncUtils;

    function test(items:  Array< String>) {
        return   AsyncUtils.forEachAsync(items,  function ( item) {
            return   processItem(item).then(function (_) {
                return  Promise.resolve();
            });
        }).then(function (_) {
            return  Promise.resolve('done');
        });
    }
    "
  `);
});

test('transforms try-catch with await', async () => {
  await expect(ts2hx`
  async function test() {
    try {
      await riskyOperation();
      return 'success';
    } catch (error) {
      console.error(error);
      return 'failure';
    } finally {
      await cleanup();
    }
  }
  `).resolves.toMatchInlineSnapshot(`
    "import ts2hx.AsyncUtils;

    function test() {
        return  AsyncUtils.tryAsync(function () {
            return   riskyOperation().then(function (_) {
                return  Promise.resolve('success');
            });
        },  function ( error) {
            
            console.error(error);
            return  Promise.resolve('failure');
        },  function () {
            return   cleanup().then(function (_) {
                return  Promise.resolve();
            });
        });
    }
    "
  `);
});

test('transforms complex nested async patterns', async () => {
  await expect(ts2hx`
  async function processData(data: string[]) {
    let results = [];
    for (let i = 0; i < data.length; i++) {
      try {
        const item = data[i];
        const processed = await processItem(item);
        if (processed.isValid) {
          results.push(processed);
          await logSuccess(processed);
        } else {
          await logFailure(item);
        }
      } catch (error) {
        console.error(\`Error processing item \${i}:\`, error);
        await logError(error);
      }
    }
    return results;
  }
  `).resolves.toMatchInlineSnapshot(`
    "import ts2hx.AsyncUtils;

    function processData(data:  Array< String>) {
        var results = [];
        return   AsyncUtils.asyncLoop(0,  data.length,  function ( i) {
            return  AsyncUtils.tryAsync(function () {
                final item = data[i];
                return   processItem(item).then(function (processed) {
                    if (processed.isValid != null) {
                        
                        results.push(processed);
                        return   logSuccess(processed).then(function (_) {
                            return  Promise.resolve();
                        });
                    }
                    else {
                        return   logFailure(item).then(function (_) {
                            return  Promise.resolve();
                        });
                    }
                });
            },  function ( error) {
                
                console.error('Error processing item \${i}:',  error);
                return   logError(error).then(function (_) {
                    return  Promise.resolve();
                });
            });
        }).then(function (_) {
            return  Promise.resolve(results);
        });
    }
    "
  `);
});

test('handles Promise rejection in async functions', async () => {
  await expect(ts2hx`
  async function failingFunction() {
    throw new Error('Something went wrong');
  }

  async function rejectingFunction() {
    return Promise.reject('Explicit rejection');
  }
  `).resolves.toMatchInlineSnapshot(`
    "import haxe.Exception;

    function failingFunction() {
        return  Promise.reject(new Exception('Something went wrong'));
    }
    function rejectingFunction() {
        return  Promise.reject('Explicit rejection');
    }
    "
  `);
});

test('handles break and continue in async loops', async () => {
  await expect(ts2hx`
  async function test(items: string[]) {
    for (const item of items) {
      if (item === 'skip') continue;
      if (item === 'stop') break;
      await processItem(item);
    }
    return 'done';
  }
  `).resolves.toMatchInlineSnapshot(`
    "import ts2hx.AsyncUtils;

    function test(items:  Array< String>) {
        return   AsyncUtils.forEachAsync(items,  function ( item) {
            if (item == 'skip')
                return  Promise.resolve();
            if (item == 'stop')
                return  Promise.resolve(AsyncUtils.BREAK);
            return   processItem(item).then(function (_) {
                return  Promise.resolve();
            });
        }).then(function (_) {
            return  Promise.resolve('done');
        });
    }
    "
  `);
});

test('handles early return from a conditional branch', async () => {
  await expect(ts2hx`
  async function test(flag: boolean) {
    if (flag) {
      return 'early';
    }
    await doSomething();
    return 'late';
  }
  `).resolves.toMatchInlineSnapshot(`
    "function test(flag:  Bool) {
        if (flag) {
            return  Promise.resolve('early');
        }
        return   doSomething().then(function (_) {
            return  Promise.resolve('late');
        });
    }
    "
  `);
});

test('keeps unsupported await patterns with a TODO comment', async () => {
  await expect(
    ts2hx(
      `
  async function test() {
    while (await hasNext()) {
      process();
    }
    const x = (await getFlag()) ? await getA() : null;
    return x;
  }
  `,
      { includeTodos: true },
    ),
  ).resolves.toMatchInlineSnapshot(`
    "function test() {
        /* TODO(ts2hx): 'await' in a loop condition is not supported */
        while (@:await  hasNext() != null) {
            
            process();
        }
        return   getFlag().then(function (_awaited) {
            /* TODO(ts2hx): conditionally evaluated 'await' (in '&&', '||', '??' or '?:') is not supported */
            final x = (_awaited != null) ? @:await  getA() : null;
            return  Promise.resolve(x);
        });
    }
    "
  `);
});

test('keeps async-await metadata when transformAsyncAwait is disabled', async () => {
  await expect(
    ts2hx(
      `
  async function test() {
    await doSomething();
    return 'done';
  }
  `,
      { transformAsyncAwait: false },
    ),
  ).resolves.toMatchInlineSnapshot(`
    "@:async function test() {
        @:await  doSomething();
        return 'done';
    }
    "
  `);
});

test('handles function calls with await', async () => {
  await expect(ts2hx`
  async function test() {
    const result1 = calculate(await getValue());
    const result2 = await calculate(await getValue());
    return result1 + result2;
  }
  `).resolves.toMatchInlineSnapshot(`
    "function test() {
        return   getValue().then(function (_awaited) {
            final result1 = calculate(_awaited);
            return   getValue().then(function (_awaited2) {
                return   calculate(_awaited2).then(function (result2) {
                    return  Promise.resolve(result1 + result2);
                });
            });
        });
    }
    "
  `);
});
