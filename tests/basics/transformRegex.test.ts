import { ts2hx } from '@tests/framework';

test('transforms regex', () => {
  expect(ts2hx`
let myRegex = /[a-z]{0,9}/gim;
`).toMatchInlineSnapshot(`
    "
    var  myRegex =  ~/[a-z]{0,9}/gim;
    "
  `);
});
