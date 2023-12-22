import { ts2hx } from '@tests/framework';

test('transforms interface property signature into var', async () => {
  await expect(ts2hx`
interface I {
  foo?: string;
  bar: number;
}
`).resolves.toMatchInlineSnapshot(`
    "interface I {
        @:optional public var foo:  String;
        public var bar:  Float;
    }
    "
  `);
});

test('transforms type property signature into var', async () => {
  await expect(ts2hx`
type T = {
  foo?: string;
  bar: number;
};
`).resolves.toMatchInlineSnapshot(`
    "typedef T = {
        public var ?foo:  String;
        public var bar:  Float;
    };
    "
  `);
});

test('transforms property signature without type', async () => {
  await expect(ts2hx`
type T = { foo; };
`).resolves.toMatchInlineSnapshot(`
    "typedef T = {
        public var foo: Any;
    };
    "
  `);
});
