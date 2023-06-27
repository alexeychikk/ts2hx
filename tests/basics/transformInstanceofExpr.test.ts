import { ts2hx } from '@tests/framework';

test('transforms instanceof expression', () => {
  expect(ts2hx`
class Foo {}
let myFoo = new Foo();
let myInstanceof = myFoo instanceof Foo;
`).toMatchInlineSnapshot(`
    "
    class Foo  {
      public function new() {}

    }
    var  myFoo =  new Foo();
    var  myInstanceof =  Std.isOfType(myFoo, Foo);
    "
  `);
});
