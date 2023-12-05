import { ts2hx } from '@tests/framework';

test('transforms arrow function with inline body', async () => {
  await expect(ts2hx`
const foo = <T extends string>(bar: T, baz: boolean): number => 0;
`).resolves.toMatchInlineSnapshot(`
    "final foo = <T :  String>(bar:  T, baz:  Bool): Float -> 0;
    "
  `);
});

test('transforms arrow function with inline body', async () => {
  await expect(ts2hx`
const foo = <T extends string>(bar: T, baz: boolean): number => 0;
`).resolves.toMatchInlineSnapshot(`
    "final foo = <T :  String>(bar:  T, baz:  Bool): Float -> 0;
    "
  `);
});
