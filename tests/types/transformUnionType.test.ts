import { ts2hx } from '@tests/framework';

test('transforms union type to EitherType', async () => {
  await expect(ts2hx`
let myVar1: number | string;
let myVar2: number | string | boolean | { foo: string };
`).resolves.toMatchInlineSnapshot(`
    "import haxe.extern.EitherType;

    var myVar1: EitherType<Float, String>;
    var myVar2: EitherType<Float, EitherType<String, EitherType<Bool, {
        public var foo:  String;
    }>>>;
    "
  `);
});

test('reduces union of equal types to 1 type', async () => {
  await expect(ts2hx`
let myVar1: 0 | 1 | -1;
let myVar2: "foo" | "bar" | "baz";
`).resolves.toMatchInlineSnapshot(`
    "var myVar1: Float;
    var myVar2: String;
    "
  `);
});

test('transforms union with undefined or null to Null<T>', async () => {
  await expect(ts2hx`
let myVar1: string | undefined;
let myVar2: number | null;
let myVar3: undefined | { foo: string } | null;
let myVar4: undefined | string | null | undefined | number | null;
`).resolves.toMatchInlineSnapshot(`
    "import haxe.extern.EitherType;

    var myVar1: Null<String>;
    var myVar2: Null<Float>;
    var myVar3: Null<{
        public var foo:  String;
    }>;
    var myVar4: Null<EitherType<String, Float>>;
    "
  `);
});
