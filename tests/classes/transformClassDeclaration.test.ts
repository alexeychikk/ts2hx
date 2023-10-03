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

test('adds access modifier for class members', async () => {
  await expect(ts2hx`
  class Foo {
    static staticFoo: string = 'static foo';
    _foo: string;
    private foo1: string;

    get foo(): string {
      return this.foo;      
    }

    set foo(value: string) {
      this.foo = value;
    }

    constructor() {
      this._foo = 'foo';
      this.foo1 = 'foo1';
    }

    bar() {}
    async asyncBar(): Promise<void> {}
    static async asyncStaticBar(): Promise<void> {}

    protected baz() {}
    public fooBar() {}
  }
  `).resolves.toMatchInlineSnapshot(`
    "class Foo  {
        
        public  static var staticFoo:  String=  'static foo';
        
        public var _foo:  String;
        
        private var foo1:  String;
        public var foo(get, set):  String;
        
        public function get_foo():  String {
            return this.foo;
        }
        
        public function set_foo(value:  String){return (
            this.foo = value );}
        
        public function new() {
            this._foo = 'foo';

            this.foo1 = 'foo1';
        }
        
        public function bar() { }
         @async 
        public function asyncBar():  Promise<Void> { }
         @async 
        public  static function asyncStaticBar():  Promise<Void> { }
        
        private function baz() { }
        
        public function fooBar() { }
    }
    "
  `);
});
