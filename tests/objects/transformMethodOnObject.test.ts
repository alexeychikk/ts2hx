import { ts2hx } from '@tests/framework';

test('transforms method on object literal into function property', async () => {
  await expect(ts2hx`
let foo = {
  bar() {}
  baz<T>(foo: string): T {
    return foo;
  }
}
`).resolves.toMatchInlineSnapshot(`
    "var foo = {
        bar: function () { },
        baz: function <T>(foo:  String): T {
            return foo;
        }
    };
    "
  `);
});
