import { ts2hx } from '@tests/framework';

test('transforms rest parameters', async () => {
  await expect(ts2hx`
const foo = (...args: string[]) => {};
const bar = (...args: Array<number>) => {};

type Foo = (...args: string[]) => void;
type Bar<T extends (...args: Array<number>) => void> = { bar: T };

type A = Array<any>;
type B = (...args: A) => void;
`).resolves.toMatchInlineSnapshot(`
    "final foo = function (...args:  String) { };
    final bar = function (...args: Float) { };
    typedef Foo = (...args:  String) -> Void;
    typedef Bar<T :  (...args: Float) -> Void> = {
        public var bar:  T;
    };
    typedef A = Array<Any>;
    typedef B = (...args: /* A */Any) -> Void;
    "
  `);
});
