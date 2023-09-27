import { ts2hx } from '@tests/framework';

test('transforms pow expression', async () => {
  await expect(ts2hx`
let myPow = 2 ** 3;
myPow **= 4;
`).resolves.toMatchInlineSnapshot(`
    "var myPow = Math.pow(2,  3);
    myPow =  Math.pow(myPow,  4);
    "
  `);
});
