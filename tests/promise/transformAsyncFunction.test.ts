import { ts2hx } from '@tests/framework';

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
            return  Promise.resolve(1);
        if (a > 0.4)
            return  Promise.resolve(7);
        if (a > 0.3) {
            while (a > 0.1) {
                
                (function () { return 4; })();
                return  Promise.resolve(5);
            }
            return  Promise.resolve(2);
        }
        final foo = () -> 'bar';
        function bar() { return 'foo'; }
        final fooBar = function () { return 'fooBar'; };
        
        (function () { return 6; })();
        return  Promise.resolve(3);
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
        
        public function asyncMethod2() { return  Promise.resolve('bar'); }
        
        public function asyncMethod3() { return  Promise.resolve(this.method2()); }
        
        public function asyncMethod4() { return  Promise.reject('oops'); }
        
        public function asyncMethod5() { function x() { return  Promise.resolve(42); } ; return  Promise.resolve(x); }
    }
    "
  `);
});
