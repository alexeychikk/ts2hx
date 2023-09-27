import { ts2hx } from '@tests/framework';

test('transforms shorthand property assignment', async () => {
  await expect(ts2hx`
let foo = "bar";
let bar = { foo };
  `).resolves.toMatchInlineSnapshot(`
    "var foo = "bar";
    var bar = { foo: foo };
    "
  `);
});
