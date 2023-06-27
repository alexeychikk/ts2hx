import { ts2hx } from '@tests/framework';

test('transforms typeof expression', () => {
  expect(ts2hx`
let myString = "foo";
let myTypeof = typeof myString;
`).toMatchInlineSnapshot(`
    "
    var  myString =  "foo";
    var  myTypeof =  Ts2hx.typeof( myString);
    "
  `);
});
