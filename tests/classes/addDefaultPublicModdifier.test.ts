import { ts2hx } from '@tests/framework';

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
        
        public function asyncBar():  Promise<Void> { }
        
        public  static function asyncStaticBar():  Promise<Void> { }
        
        private function baz() { }
        
        public function fooBar() { }
    }
    "
  `);
});

test('works with decorators', async () => {
  await expect(ts2hx`
class Foo {
  @Game.chain
  init() {}

  @PromiseChain()
  async run() {}
}
`).resolves.toMatchInlineSnapshot(`
    "class Foo  {
      public function new() {}

        
        @Game.chain 
        public function init() { }
        
        @PromiseChain() 
        public function run() { }
    }
    "
  `);
});
