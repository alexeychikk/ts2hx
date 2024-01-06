import { ts2hx } from '@tests/framework';

test('transforms simple template string literal', async () => {
  await expect(ts2hx`
let myLiteral = \`"Hello"\`;
`).resolves.toMatchInlineSnapshot(`
    "var myLiteral = "\\"Hello\\"";
    "
  `);
});

test('transforms template string literal expression', async () => {
  await expect(
    ts2hx(
      'let myLiteral = `foo ${varX} bar ${varY ? `inner ${varZ} end` : ""} baz`;',
    ),
  ).resolves.toMatchInlineSnapshot(`
    "var myLiteral = 'foo \${varX} bar \${(varY != null) ? 'inner \${varZ} end' : ""} baz';
    "
  `);
});

test('transforms template expression to add expression', async () => {
  await expect(
    ts2hx(
      'let myLiteral = `foo ${varX} bar ${varY ? `inner ${varZ} end` : ""} baz`;',
      { transformTemplateExpression: true },
    ),
  ).resolves.toMatchInlineSnapshot(`
    "var myLiteral = "foo " + (varX + " bar ") + (((varY != null) ? "inner " + (varZ + " end") : "") + " baz");
    "
  `);
});
