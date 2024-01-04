import { ts2hx } from '@tests/framework';

test('transforms tuple type to EitherType', async () => {
  await expect(ts2hx`
let myVar1: [number, string];
let myVar2: [number, string, boolean, { foo: string }];
let myVar3: [];
`).resolves.toMatchInlineSnapshot(`
    "import haxe.extern.EitherType;

    var myVar1: Array<EitherType<Float, String>>;
    var myVar2: Array<EitherType<Float, EitherType<String, EitherType<Bool, {
            public var foo:  String;
        }>>>>;
    var myVar3: Array<Any>;
    "
  `);
});

test('union + tuple types to EitherType', async () => {
  await expect(ts2hx`
let myVar1: [number | boolean, string] | boolean | string;
`).resolves.toMatchInlineSnapshot(`
    "import haxe.extern.EitherType;

    var myVar1: EitherType<Array<EitherType<EitherType<Float, Bool>, String>>, EitherType<Bool, String>>;
    "
  `);
});
