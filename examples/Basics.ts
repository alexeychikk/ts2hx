// Basic types
var myString: string;
let myNumber: number = 4;
let myHexNumber: number = 0xff;
let myNan = NaN;
const myBoolean: boolean = false;
let myNull: null = null;
let myUndefined: undefined = undefined;
let myVoid = void 0;

/**
 * Literal types
 */
var myImplicitLiteralString = 'foo',
  myImplicitLiteralNumber = 42.5;
const myImplicitLiteralBoolean = false;
const myRegex = /^[a-z]{0,5}\S+?$/gim;

var myExplicitLiteralString: 'bar' = 'bar';
let myExplicitLiteralNumber: 10 = 10;
const myExplicitLiteralBoolean: true = true;
// ---

// Advanced types
var myUnion: string | number = 'wow';
let myStringArray: string[] = ['foo', 'bar'];
let myNumberArray: Array<number> = [2, 3.5];
type MyMapKey = { key: string };
type MyMapValue = { value: string };
let myMap = new Map<MyMapKey, MyMapValue>();
let myTuple: [number, boolean] = [10, false];
const myLiteralUnion: 'Foo' | 'Bar' = 'Bar';

// Strings
var myBasicConcatenation = "'Hello' " + myImplicitLiteralString + ' "world" !';
let myTemplateSimple = `'Foo' "Bar"`;
const myTemplateMultiline = `Hello
"world"!
Foo 'Bar'!`;
const myTemplateInterpolation = `Start ${
  myExplicitLiteralBoolean
    ? `inner "start" ${myImplicitLiteralBoolean} 'inner' end`
    : myNumber
} End`;

// Objects
const myObject = {
  foo: 'foo',
  bar: 10,
  '0_stringKey': [{}],
  [`${myUnion}`]: myNumberArray,
  get prop() {
    return 'foo';
  },
  set prop(value: string) {
    this.foo = value;
  },
  myMethod() {},
  myFnProp: function foo(): void {
    console.log('foo');
  },
  myAnonymousFnProp: function () {
    return 'foo';
  },
  myArrowFnProp: () => ({ foo: 'bar' }),
};
/* --- */

function wrapper() {
  // Expressions
  myImplicitLiteralNumber = 5.5;
  const myMathExpression = 4 + (myNumber * 2) / (10 - myHexNumber);
  const myComplexBinaryExpression =
    (!1 || 0 || !myNumber) &&
    (!0 || 1 || !myImplicitLiteralString) &&
    (!null || !undefined || !NaN || ![] || !{}) &&
    (null || undefined || NaN || [] || {}) &&
    (!'foo' || !'' || 'bar' || '' || myUnion || myTuple) &&
    (!myBoolean || !myStringArray || !myObject);
  const myTernaryExpression = myObject ? myExplicitLiteralNumber : myNumber;
  const myObjectAccess = myObject.bar,
    myObjectStringAccess = myObject['foo'];
  myObject.foo = 'not foo';
  myObject['0_stringKey'] = [];
  const myArrayAccess = myNumberArray[1];
  const myTypeOf = typeof myImplicitLiteralNumber;
  void (2 * 2 === 4);

  if (myNumber) {
    console.log('if statement');
  } else if (myString) {
    console.log('else if statement');
  } else {
    console.log('else statement');
  }

  while (myNumber) {
    console.log('never');
  }

  do {
    console.log('once');
  } while (myNumber);

  for (let i = 0, j = 10; myExplicitLiteralNumber; i++, j--) {
    console.log('first');
    console.log('second');
  }

  for (const num of myNumberArray) {
    console.log('for of loop', num);
  }

  for (const key in myObject) {
    console.log('for in loop', key, myObject[key]);
  }

  // make sure infinite loop is last
  for (;;) console.log('infinite');
}
