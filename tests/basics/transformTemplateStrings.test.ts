import { ts2hx } from '@tests/framework';

test('transforms simple template string literal', () => {
  expect(ts2hx`
let myLiteral = \`"Hello"\`;
`).toMatchInlineSnapshot(`
    "
    var  myLiteral =  "\\"Hello\\"";
    "
  `);
});

test('transforms template string literal expression', () => {
  expect(
    ts2hx(
      'let myLiteral = `foo ${varX} bar ${varY ? `inner ${varZ} end` : ""} baz`;',
    ),
  ).toEqual(
    "var  myLiteral =  'foo ${varX} bar ${varY != null ? 'inner ${varZ} end' : \"\"} baz';",
  );
});
