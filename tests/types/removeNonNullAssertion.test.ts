import { ts2hx } from '@tests/framework';

test('removes non null expression', async () => {
  await expect(ts2hx`
let a: { foo?: { bar?: string } };
let b = a!.foo!.bar!;
`).resolves.toMatchInlineSnapshot(`
    "var a: {
        public var ?foo:  {
            public var ?bar:  String;
        };
    };
    var b = a.foo.bar;
    "
  `);
});

test('removes non null assertion from variable declaration', async () => {
  await expect(ts2hx`
type Foo = string | undefined;
let a!: Foo;
`).resolves.toMatchInlineSnapshot(`
    "import haxe.extern.EitherType;

    typedef Foo = EitherType< String,  Null<Any>>;
    var a: Foo;
    "
  `);
});

test('removes non null assertion from property declaration', async () => {
  await expect(ts2hx`
class Foo {
  bar!: string;
}
`).resolves.toMatchInlineSnapshot(`
    "class Foo  {
      public function new() {}

        
        public var bar:  String;
    }
    "
  `);
});
