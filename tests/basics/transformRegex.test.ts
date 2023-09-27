import { ts2hx } from '@tests/framework';

test('transforms regex', async () => {
  await expect(ts2hx`
let myRegex = /[a-z]{0,9}/gim;
`).resolves.toMatchInlineSnapshot(`
    "var myRegex = ~/[a-z]{0,9}/gim;
    "
  `);
});
