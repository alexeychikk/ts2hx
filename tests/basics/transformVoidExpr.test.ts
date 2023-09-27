import { ts2hx } from '@tests/framework';

test('transforms void expression', async () => {
  await expect(ts2hx`
let myVoid = void 0;
void 0;
void (myFnCall());
`).resolves.toMatchInlineSnapshot(`
    "var myVoid = null;
    null;
    (function() { (myFnCall());})();
    "
  `);
});
