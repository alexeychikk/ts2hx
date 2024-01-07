import { ts2hx } from '@tests/framework';

test('JSDoc node is ignored but the comment itself is included in output', async () => {
  await expect(ts2hx`
/**
 * @see https://github.com
 */
function foo() {}
`).resolves.toMatchInlineSnapshot(`
    "/**
     * @see https://github.com
     */
    function foo() { }
    "
  `);
});
