import { ts2hx } from '@tests/framework';

test('transforms let to var and const to final', async () => {
  await expect(ts2hx`
let myLet = 'foo';
const myConst: number = 10;
`).resolves.toMatchInlineSnapshot(`
    "var myLet = 'foo';
    final myConst: Float = 10;
    "
  `);
});
