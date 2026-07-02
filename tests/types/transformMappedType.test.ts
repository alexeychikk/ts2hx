import { ts2hx } from '@tests/framework';

test('transforms mapped type to Dynamic<v>', async () => {
  await expect(ts2hx`
type Poo = { foo: string, bar: string };
type Foo = {
  [key in keyof Poo]: number;
}
`).resolves.toMatchInlineSnapshot(`
    "typedef Poo = {
        public var foo:  String;
        public var bar:  String;
    };
    typedef Foo = Dynamic<Float>;
    "
  `);
});

test('transforms optional mapped type to Dynamic<Null<v>>', async () => {
  await expect(ts2hx`
type Count = 2 | 3 | 4;
type Bar = {
  [key in Count]?: number;
}
`).resolves.toMatchInlineSnapshot(`
    "typedef Count = Float;
    typedef Bar = Dynamic<Null<Float>>;
    "
  `);
});
