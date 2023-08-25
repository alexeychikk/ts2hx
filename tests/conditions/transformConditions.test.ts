import { ts2hx } from '@tests/framework';

describe('transforms implicit cast to boolean in conditional expressions into explicit', () => {
  test('handles literals', () => {
    expect(ts2hx`
if (true) {} else if (false) {} else if (null) {}
if (0) {} else if (1) {} else if (-5 * 0) {}
if ('') {} else if ("foo") {} else if (\`\`) {} else if ("".repeat(2)) {}
if ([]) {} else if ({}) {} else if (() => 0) {}
if (undefined) {} else if (NaN) {}
`).toMatchInlineSnapshot(`
      "
      if (true) {} else if (false) {} else if (false) {}
      if (false) {} else if (true) {} else if (-5 * 0 != 0) {}
      if (false) {} else if (true) {} else if (false) {} else if ("".repeat(2) != "") {}
      if (true) {} else if (true) {} else if (true) {}
      if (false) {} else if (false) {}
      "
    `);
  });

  test('handles variables', () => {
    expect(ts2hx`
const myBoolean: boolean = true;
const myTrue: true = true;
const myFalse: false = false;
const myNumber = 0;
const myString = "foo";
const myTen: 10 = 10;
const myBar: "bar" = "bar";
const myUnion: 'foo' | 'bar' = 'foo';
const myObject = { foo: 'bar' };
const myArray = [1, 2, 3];
const myFunction = () => 0;
class Foo {}
const myFoo = new Foo();

if (myBoolean) {} else if (myTrue) {} else if (myFalse) {}
if (myNumber) {} else if (myString) {}
if (myTen) {} else if (myBar) {} else if (myUnion) {}
if (myObject) {} else if (myArray) {} else if (myFunction) {}
if (Foo) {} else if (myFoo) {}
`).toMatchInlineSnapshot(`
      "import haxe.extern.EitherType;


      final  myBoolean:  Bool =  true;
      final  myTrue:  Bool =  true;
      final  myFalse:  Bool =  false;
      final  myNumber =  0;
      final  myString =  "foo";
      final  myTen:  Float =  10;
      final  myBar:  String =  "bar";
      final  myUnion:  EitherType< String,  String> =  'foo';
      final  myObject =  { foo: 'bar' };
      final  myArray =  [1, 2, 3];
      final  myFunction =  () -> 0;
      class Foo  {
        public function new() {}

      }
      final  myFoo =  new Foo();

      if (myBoolean) {} else if (myTrue) {} else if (myFalse) {}
      if (myNumber != 0) {} else if (myString != "") {}
      if (myTen != 0) {} else if (myBar != "") {} else if (myUnion != "") {}
      if (myObject != null) {} else if (myArray != null) {} else if (myFunction != null) {}
      if (Foo != null) {} else if (myFoo != null) {}
      "
    `);
  });

  test('handles ternary operators', () => {
    expect(ts2hx`
const myStr = '';
const myVar = myStr ? 1 : 0;
    `).toMatchInlineSnapshot(`
      "
      final  myStr =  '';
      final  myVar =  ( myStr != "") ? 1 : 0;
          "
    `);
  });

  test('handles boolean operators', () => {
    expect(ts2hx`
if ("" || "foo") {} else if (0 && 1) {}
if (!({})) {} else if (!0) {}
if (!(0 || 1) && ("" || !"")) {}
if (!(5 * 3) || ("" + "454") && (!Object.assign({}))) {}
if (3 === 2 + 1 || !(5 === 3 + 2 && "foo") {}
        `).toMatchInlineSnapshot(`
      "
      if (false || true) {} else if (false && true) {}
      if (!(true)) {} else if (!false) {}
      if (!(false || true) && (false || !false)) {}
      if (!(5 * 3 != 0) ||  ("" + "454" != "") && (!(Object.assign({}) != null))) {}
      if (3 == 2 + 1 || !(5 == 3 + 2 && true) {}
              "
    `);
  });

  test('handles loops', () => {
    expect(ts2hx`
while (1) {}
do {} while ("a".repeat(2)) {}
for (let myVar = 10; myVar;) {}
            `).toMatchInlineSnapshot(`
      "
      while (true) {}
      do {} while ("a".repeat(2) != "") {}
      var  myVar =  10;
      while(( myVar != 0)) {
      }
                  "
    `);
  });

  test('handles variable declarations', () => {
    expect(ts2hx`
const a = "";
const b = a || "default";
const c = a || (b || "foo");
const d = c && !("bar".repeat(2)) && 0;
            `).toMatchInlineSnapshot(`
      "
      final  a =  "";
      final  b =   a.or( "default");
      final  c =   a.or( (b.or( "foo")));
      final  d =  (  c.and( !("bar".repeat(2) != ""))).and( 0);
                  "
    `);
  });
});
