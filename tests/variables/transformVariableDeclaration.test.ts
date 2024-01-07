import { ts2hx } from '@tests/framework';

test('transforms let to var and const to final', async () => {
  await expect(ts2hx`
let myLet = 'foo';
const myConst: number = 10;
`).resolves.toMatchInlineSnapshot(`
    "var myLet = 'foo';
    final myConst: Float = 10;
    "
  `);
});

test('ensures variable names are haxe compliant', async () => {
  await expect(
    ts2hx(
      'let $$foo$$bar$$ = "foo";\n' +
        'let foo = $$foo$$bar$$;\n' +
        'let bar = () => $$foo$$bar$$;',
    ),
  ).resolves.toMatchInlineSnapshot(`
    "var $_foo__bar__ = "foo";
    var foo = $_foo__bar__;
    var bar = () -> $_foo__bar__;
    "
  `);
});

test('preserves comments as much as possible', async () => {
  await expect(
    ts2hx`
/**
 * This is jsdoc
 */
let foo = 10, bar = 20, baz = 30;
// This is a comment
let tax = 40;
/* inline */ let foobar/*: Int */ = 30; // yikes 
`,
  ).resolves.toMatchInlineSnapshot(`
    " /**
     * This is jsdoc
     */
    var foo = 10;
     var bar = 20;
     var baz = 30;
    // This is a comment
    var tax = 40;
    /* inline */ var foobar = 30; // yikes 
    "
  `);
});
