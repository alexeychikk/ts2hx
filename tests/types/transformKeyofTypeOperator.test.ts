import { ts2hx } from '@tests/framework';

test('transforms keyof T to string', async () => {
  await expect(ts2hx`
type Poo = { foo: string, bar: string };
type K = keyof Poo;
`).resolves.toMatchInlineSnapshot(`
    "typedef Poo = {
        public var foo:  String;
        public var bar:  String;
    };
    typedef K = String;
    "
  `);
});
