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
      'let varX, varY, varZ;\n' +
        'let myLiteral = `foo ${varX} bar ${varY ? `inner ${varZ} end` : ""} baz`;',
    ),
  ).resolves.toMatchInlineSnapshot(`
    "var varX;
     var varY;
     var varZ;
    var myLiteral = 'foo \${varX} bar \${(varY != null) ? 'inner \${varZ} end' : ""} baz';
    "
  `);
});

test('transforms template expression to add expression', async () => {
  await expect(
    ts2hx(
      'let expr = 42;\n' +
        'let myLiteral1 = `foo ${expr} bar`;\n' +
        'let myLiteral2 = `foo ${expr}`;\n' +
        'let myLiteral3 = `${expr} bar`;\n' +
        'let myLiteral4 = `${expr}`;\n' +
        'let myLiteral5 = `${expr}${expr}${expr}`;\n' +
        'let myLiteral6 = `${expr}foo${expr}bar${expr}`;\n' +
        'let myLiteral7 = `foo${expr}${expr}${expr}bar`;\n' +
        'let myLiteral8 = `foo ${expr} ${expr} ${expr} bar`;\n',
      { transformTemplateExpression: true },
    ),
  ).resolves.toMatchInlineSnapshot(`
    "var expr = 42;
    var myLiteral1 = "foo " + (expr + " bar");
    var myLiteral2 = "foo " + expr;
    var myLiteral3 = expr + " bar";
    var myLiteral4 = "" + expr;
    var myLiteral5 = "" + expr + expr + expr;
    var myLiteral6 = "" + (expr + "foo") + (expr + "bar") + expr;
    var myLiteral7 = "foo" + expr + expr + (expr + "bar");
    var myLiteral8 = "foo " + (expr + " ") + (expr + " ") + (expr + " bar");
    "
  `);
});
