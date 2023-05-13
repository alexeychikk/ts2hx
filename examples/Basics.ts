type MyMapKey = { key: string };
type MyMapValue = { value: string };

class Basics {
  static main() {
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
    let myNumberArray: Array<number> = [2, 3.5, 4, 5];
    let myMap = new Map<MyMapKey, MyMapValue>();
    let myTuple: [number, boolean] = [10, false];
    const myLiteralUnion: 'Foo' | 'Bar' = 'Bar';

    // Strings
    var myBasicConcatenation =
      "'Hello' " + myImplicitLiteralString + ' "world" !';
    let myTemplateSimple = `'Foo' "Bar"`;
    const myTemplateMultiline = `Hello
"world"!
Foo 'Bar'!`;
    // https://github.com/HaxeFoundation/haxe/issues/11216
    const myTemplateInterpolation = `Start ${
      myExplicitLiteralBoolean
        ? `inner "start" ${myImplicitLiteralBoolean} end`
        : myNumber
    } End`;

    // Objects
    const myObject = {
      foo: 'foo',
      bar: 10,
      inner: { foo: 'bar', lol: 'wow' },
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

      // Destructuring
      const {
        foo,
        bar: barRenamed,
        inner: { foo: fooRenamed, lol = 'wow', ...restInner },
        ...restObj
      } = myObject;
      let [firstNum, , ...restNums] = myNumberArray;

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
        if (myBoolean) continue;
        console.log('for of loop', num);
      }

      for (const key in myObject) {
        console.log('for in loop', key, myObject[key]);
        if (!myBoolean) break;
      }

      // make sure infinite loop is last
      for (;;) console.log('infinite');
    }

    function withRestParams(...args: string[]) {
      myImplicitLiteralNumber **= 1;
      switch (myImplicitLiteralNumber ** 2) {
        case 10:
        case 12:
          console.log('fall through');
          break;
        case 14: {
          const a = 3;
          console.log('block scoped', a);
          break;
        }
        case myNumber:
          console.log('no break');
        case 81:
          console.log('return');
          return;
        case 100:
        case 1000:
        default:
          console.log('default');
          break;
      }
    }

    function withOptionalParams(foo?: string, bar = 4, ...args: Array<number>) {
      try {
        throw new Error('foo');
      } catch (error: unknown) {
        console.log(error instanceof Error);
      }
    }

    async function sleep(ms = 0): Promise<null> {
      return new Promise((resolve, reject) =>
        setTimeout(() => resolve(null), ms),
      );
    }

    async function myAsyncFn() {
      console.log('before sleep');
      await sleep();
      console.log('after sleep');
    }

    console.log('Main complete!');
  }
}
