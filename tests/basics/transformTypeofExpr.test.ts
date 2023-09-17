import { ts2hx } from '@tests/framework';

test('transforms typeof expression', async () => {
  await expect(ts2hx`
let myString = "foo";
let myTypeof = typeof myString;
`).resolves.toMatchInlineSnapshot(`
    "
    var  myString =  "foo";
    var  myTypeof =  Ts2hx.typeof( myString);
    "
  `);
});
