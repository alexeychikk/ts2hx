import { ts2hx } from '@tests/framework';

test('transforms void expression', () => {
  expect(ts2hx`
let myVoid = void 0;
void 0;
void (myFnCall());
`).toMatchInlineSnapshot(`
    "
    var  myVoid =  null;
    null;
    (function() { (myFnCall());})();
    "
  `);
});
