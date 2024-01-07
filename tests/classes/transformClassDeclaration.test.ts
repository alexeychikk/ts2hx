import { ts2hx } from '@tests/framework';

test('transforms empty class declaration', async () => {
  await expect(ts2hx`
export class Foo {}
  `).resolves.toMatchInlineSnapshot(`
    "  class Foo  {
      public function new() {}

    }
    "
  `);
});

test('transforms abstract class declaration', async () => {
  await expect(ts2hx`
export default abstract class Foo {}
  `).resolves.toMatchInlineSnapshot(`
    "   abstract class Foo  {
    }
    "
  `);
});

test('transforms anonymous class declaration', async () => {
  await expect(ts2hx`
export default class {};
  `).resolves.toMatchInlineSnapshot(`
    "  class AnonymousClass_0  {
      public function new() {}

    }
    ;
    "
  `);
});

test('transforms class declaration with inheritance', async () => {
  await expect(ts2hx`
class Foo {
  constructor (foo: string) {
    // some code ...
  }
}
class Bar extends Foo {}
class Baz extends Bar {
  constructor (baz: string) {
    super(baz);
  }
}
class FooError extends Error {}
class FooBarError extends Error {
  constructor () {
    super('FooBar error message');
  }
}
  `).resolves.toMatchInlineSnapshot(`
    "import haxe.Exception;

    class Foo  {
        
        public function new(foo:  String) {
        }
    }
    class Bar  extends  Foo {
    }
    class Baz  extends  Bar {
        
        public function new(baz:  String) {
            
            super(baz);
        }
    }
    class FooError  extends  Exception {
    }
    class FooBarError  extends  Exception {
        
        public function new() {
            
            super('FooBar error message');
        }
    }
    "
  `);
});

test('removes declare modifier', async () => {
  await expect(ts2hx`
class Foo {
  declare bar: string;
}
`).resolves.toMatchInlineSnapshot(`
    "class Foo  {
      public function new() {}

        
        public var bar:  String;
    }
    "
  `);
});
