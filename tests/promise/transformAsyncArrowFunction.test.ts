import { ts2hx } from '@tests/framework';

describe('transformAsyncArrowFunction', () => {
  it('transforms async arrow function to function that returns Promise', async () => {
    await expect(ts2hx`
    const foo = async () => {
      const a = 0.1;
      if (a > 0.5)
        return 1;
      if (a > 0.4)
        return 7;
      if (a > 0.3) {
        while (a > 0.1) {
          
          (function () { return 4; })();
          return 5;
        }
        return 2;
      }
      const foo = () => 'bar';
      function bar() { return 'foo'; }
      const fooBar = function () { return 'fooBar'; };
      
      (function () { return 6; })();
      return 3;
    }
  `).resolves.toMatchInlineSnapshot(`
      "final foo = function ()  {
          final a = 0.1;
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
      };
      "
    `);
  });

  it('transforms async arrow function with single expression', async () => {
    await expect(ts2hx`
    const foo = async () => await Promise.resolve(42);
    const bar = async () => 42;
  `).resolves.toMatchInlineSnapshot(`
          "final foo = () -> Promise.resolve(42);
          final bar = () -> Promise.resolve(42);
          "
      `);
  });

  it('transforms async arrow function with parameters', async () => {
    await expect(ts2hx`
    const foo = async (x: number, y: string) => {
      await Promise.resolve(x);
      return y;
    };
    const bar = async (x: number) => x * 2;
  `).resolves.toMatchInlineSnapshot(`
      "final foo = function (x:  Float,  y:  String)  {
          
          Promise.resolve(x);
          return  Promise.resolve(y);
      };
      final bar = (x:  Float) -> Promise.resolve(x * 2);
      "
    `);
  });

  it('transforms async arrow function with type parameters', async () => {
    await expect(ts2hx`
    const foo = async <T>(x: T) => {
      await Promise.resolve(x);
      return x;
    };
    const bar = async <T>(x: T) => x;
  `).resolves.toMatchInlineSnapshot(`
      "final foo = function (x:  T)  {
          
          Promise.resolve(x);
          return  Promise.resolve(x);
      };
      final bar = (x:  T) -> Promise.resolve(x);
      "
    `);
  });

  it('transforms async arrow function with rest parameters', async () => {
    await expect(ts2hx`
    const foo = async (...args: number[]) => {
      await Promise.resolve(args);
      return args.length;
    };
    const bar = async (...args: string[]) => args.join(',');
  `).resolves.toMatchInlineSnapshot(`
      "final foo = function (...args:  Float)  {
          
          Promise.resolve(args);
          return  Promise.resolve(args.length);
      };
      final bar = (...args:  String) -> Promise.resolve(args.join(','));
      "
    `);
  });
});
