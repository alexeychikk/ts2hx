import { ts2hx } from '@tests/framework';

// For testing the async/await transformations with @:async and @:await metadata

test('transforms async function to function that returns Promise', async () => {
  await expect(ts2hx`
async function foo() {
  let a = 0.1;
  if (a > 0.5) return 1;
  if (a > 0.4) return Promise.resolve(7);
  if (a > 0.3) {
    while (a > 0.1) {
      (() => { return 4; })();
      return 5;
    }
    return 2;
  }
  const foo = () => 'bar';
  function bar() { return 'foo'; }
  const fooBar = function() { return 'fooBar'; };
  (() => { return 6; })();
  return 3;
}
`).resolves.toMatchInlineSnapshot(`
    "function foo() {
        var a = 0.1;
        if (a > 0.5)
            return 1;
        if (a > 0.4)
            return  Promise.resolve(7);
        if (a > 0.3) {
            while (a > 0.1) {
                
                (function () { return 4; })();
                return 5;
            }
            return 2;
        }
        final foo = () -> 'bar';
        function bar() { return 'foo'; }
        final fooBar = function() { return 'fooBar'; };
        
        (function () { return 6; })();
        return 3;
    }
    "
  `);
});

test('transforms async method to method that returns Promise', async () => {
  await expect(ts2hx`
class Bar {
  method() { return 'bar'; }
  async asyncMethod2() { return 'bar'; }
  async asyncMethod3() { return await this.method2(); }
  async asyncMethod4() { return Promise.reject('oops'); }
  async asyncMethod5() { async function x() { return await 42; }; return x; }
}
`).resolves.toMatchInlineSnapshot(`
    "class Bar  {
      public function new() {}

        
        public function method() { return 'bar'; }
        
        public function asyncMethod2() { return 'bar'; }
        
        public function asyncMethod3() { return  this.method2(); }
        
        public function asyncMethod4() { return  Promise.reject('oops'); }
        
        public function asyncMethod5() { function x() { return 42; } ; return x; }
    }
    "
  `);
});

test('transforms async arrow functions to return Promise', async () => {
  await expect(ts2hx`
const asyncArrow = async () => 'result';
const asyncArrowWithAwait = async () => await fetchData();
const asyncArrowWithBlock = async () => {
  const data = await fetchData();
  return data.processed;
};
`).resolves.toMatchInlineSnapshot(`
    "final asyncArrow = () -> 'result';
    final asyncArrowWithAwait = () ->  fetchData();
    final asyncArrowWithBlock = function () {
        final data = fetchData();
        return data.processed;
    };
    "
  `);
});

test('transforms async function expressions to return Promise', async () => {
  await expect(ts2hx`
const asyncExpr = async function() { return 'result'; };
const asyncExprWithAwait = async function() { 
  const data = await fetchData();
  return data; 
};
`).resolves.toMatchInlineSnapshot(`
    "final asyncExpr = function() { return 'result'; };
    final asyncExprWithAwait = function() {
        final data = fetchData();
        return data;
    };
    "
  `);
});

test('transforms await expressions correctly in various contexts', async () => {
  await expect(ts2hx`
async function processData() {
  // Simple await
  const data = await fetchData();
  
  // Await in an expression
  const processed = (await fetchData()).process();
  
  // Await in a loop
  for (let i = 0; i < 10; i++) {
    await delay(100);
    process(i);
  }
  
  // Await in conditions
  if (await checkCondition()) {
    return 'condition met';
  }
  
  // Multiple awaits in sequence
  const result1 = await step1();
  const result2 = await step2(result1);
  const result3 = await step3(result2);
  
  return result3;
}
`).resolves.toMatchInlineSnapshot(`
    "function processData() {
        // Simple await
        final data = fetchData();
        // Await in an expression
        final processed = (fetchData()).process();
        // Await in a loop
        var i = 0;
        while( i < 10) {
            
            delay(100);
            
            process(i);
     i++    }
        // Await in conditions
        if (checkCondition() != null) {
            return 'condition met';
        }
        // Multiple awaits in sequence
        final result1 = step1();
        final result2 = step2(result1);
        final result3 = step3(result2);
        return result3;
    }
    "
  `);
});

test('handles nested async functions correctly', async () => {
  await expect(ts2hx`
async function outer() {
  async function inner1() {
    return await fetchInner();
  }
  
  const inner2 = async () => {
    const data = await fetchMore();
    return data.processed;
  };
  
  return {
    result1: await inner1(),
    result2: await inner2()
  };
}
`).resolves.toMatchInlineSnapshot(`
    "function outer() {
        function inner1() {
            return  fetchInner();
        }
        final inner2 = function () {
            final data = fetchMore();
            return data.processed;
        };
        return {
            result1:  inner1(),
            result2:  inner2()
        };
    }
    "
  `);
});

test('handles Promise rejections and error handling', async () => {
  await expect(ts2hx`
async function handleErrors() {
  try {
    const data = await fetchData();
    return processData(data);
  } catch (error) {
    console.error('Failed to fetch data:', error);
    return Promise.reject(error);
  } finally {
    await cleanup();
  }
}
`).resolves.toMatchInlineSnapshot(`
    "function handleErrors() {
        try {
            final data = fetchData();
            return  processData(data);
        }
        catch (error_1) {
            var error = error_1;
            
            console.error('Failed to fetch data:',  error);
            return  Promise.reject(error);
        }
        finally {
            
            cleanup();
        }
    }
    "
  `);
});

test('handles Promise chaining with then/catch', async () => {
  await expect(ts2hx`
function promiseChain() {
  return fetchData()
    .then(data => processData(data))
    .then(result => formatResult(result))
    .catch(error => {
      console.error('Error:', error);
      return defaultResult;
    });
}

// Mixing await with then/catch
async function mixedStyles() {
  const data = await fetchData();
  
  return processData(data)
    .then(result => {
      if (result.isValid) {
        return formatResult(result);
      } else {
        return Promise.reject(new Error('Invalid result'));
      }
    })
    .catch(async error => {
      await logError(error);
      return defaultResult;
    });
}
`).resolves.toMatchInlineSnapshot(`
    "import haxe.Exception;

    function promiseChain() {
        return     fetchData()
            .then(data ->  processData(data))
            .then(result ->  formatResult(result))
            .catch(function (error) {
            
            console.error('Error:',  error);
            return defaultResult;
        });
    }
    // Mixing await with then/catch
    function mixedStyles() {
        final data = fetchData();
        return    processData(data)
            .then(function (result) {
            if (result.isValid != null) {
                return  formatResult(result);
            }
            else {
                return  Promise.reject(new Exception('Invalid result'));
            }
        })
            .catch(function (error) {
            
            logError(error);
            return defaultResult;
        });
    }
    "
  `);
});
