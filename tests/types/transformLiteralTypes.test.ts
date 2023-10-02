import { ts2hx } from '@tests/framework';

test('transforms TS literal types to Haxe types', async () => {
  await expect(ts2hx`
let myVar1: 42;
let myVar11: -1;
let myVar2: "Hello";
let myVar3: true;
let myVar4: false;
let myVar5: null;
`).resolves.toMatchInlineSnapshot(`
    "var myVar1: Float;
    var myVar11: Float;
    var myVar2: String;
    var myVar3: Bool;
    var myVar4: Bool;
    var myVar5: Null<Any>;
    "
  `);
});
