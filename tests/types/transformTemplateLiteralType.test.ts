import { ts2hx } from '@tests/framework';

test('transforms template literal type to String', async () => {
  await expect(ts2hx`
  type A = 'foo' | 'bar';
  type B = \`Hello \${A}\`;

  type C = 0 | 1;
  type D = \`Hello \${C}\`;
`).resolves.toMatchInlineSnapshot(`
    "typedef A = String;
    typedef B = String;
    typedef C = Float;
    typedef D = String;
    "
  `);
});
