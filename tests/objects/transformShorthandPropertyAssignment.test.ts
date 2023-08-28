import { ts2hx } from '@tests/framework';

test('transforms shorthand property assignment', () => {
  expect(ts2hx`
let foo = "bar";
let bar = { foo };
  `).toMatchInlineSnapshot(`
    "
    var  foo =  "bar";
    var  bar =  { foo: foo };
      "
  `);
});
