import { ts2hx } from '@tests/framework';

test('transforms variable declaration list into multiple statements', async () => {
  await expect(ts2hx`
var var1, var2: string, var3 = 'foo';
let let1, let2: boolean, let3 = false;
const const1, const2: number, const3 = 10;
`).resolves.toMatchInlineSnapshot(`
    "var var1;
     var var2: String;
     var var3 = 'foo';
    var let1;
     var let2: Bool;
     var let3 = false;
    final const1;
     final const2: Float;
     final const3 = 10;
    "
  `);
});
