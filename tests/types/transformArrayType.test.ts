import { ts2hx } from '@tests/framework';

test('transforms Type[] to Array<Type>', async () => {
  await expect(ts2hx`
let myArr: number[];
`).resolves.toMatchInlineSnapshot(`
    "var myArr: Array< Float>;
    "
  `);
});
