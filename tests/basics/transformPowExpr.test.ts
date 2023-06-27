import { ts2hx } from '@tests/framework';

test('transforms pow expression', () => {
  expect(ts2hx`
let myPow = 2 ** 3;
myPow **= 4;
`).toMatchInlineSnapshot(`
    "
    var  myPow =  Math.pow( 2,  3);

    myPow = Math.pow(myPow,  4);
    "
  `);
});
