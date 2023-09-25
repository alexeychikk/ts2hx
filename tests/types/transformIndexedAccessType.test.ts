import { ts2hx } from '@tests/framework';

test('transforms spread assignment of object literal expression', async () => {
  await expect(ts2hx`
interface Foo { bar: Bar; wow: string };
type Bar = { baz: number, boo: Boo };
type Boo = { boo: 'hoo', coords: { x: number, y: number } }

type FooBar = Foo['bar'];
type FooWow = Foo['wow'];
type FooBarBaz = Foo['bar']['baz'];  
type FooBarBoo = Foo['bar']['boo'];  
type FooBarBooCoords = Foo['bar']['boo']['coords'];  
`).resolves.toMatchInlineSnapshot(`
    "interface Foo {
        public var bar:  Bar;
        public var wow:  String;
    }
    ;
    typedef Bar = {
        public var baz:  Float;
        public var boo:  Boo;
    };
    typedef Boo = {
        public var boo:  String;
        public var coords:  {
            public var x:  Float;
            public var y:  Float;
        };
    };
    typedef FooBar = Bar;
    typedef FooWow = String;
    typedef FooBarBaz = Float;
    typedef FooBarBoo = Boo;
    typedef FooBarBooCoords =  {
            public var x:  Float;
            public var y:  Float;
        };
    "
  `);
});
