import { ts2hx } from '@tests/framework';

test('transforms keywords and syntax tokens', async () => {
  await expect(
    ts2hx`
let myNumber: number;
let myString: string;
let myBoolean: boolean;
let myUndefined: undefined;
let myVoid: () => void;
let myNever: never;
let myUnknown: unknown;
let myAny: any;
let myAsKeyword = [] as string[];
let myAsyncAwait = async function() {
  await Promise.resolve();
};
export const myExport = {};
export default myExport;
export { myNumber };
class MyReadonlyClass {
  readonly myReadonly = 0;
  protected myProtected?: string;
}
type MyReadonlyType = {
  readonly myReadonly: number;
}
let myEqEqEqToken = 3 === "3";
let myExEqEqToken = 3 !== "3";
let myUndefinedValue = undefined;
let myNaN = NaN;
`,
  ).resolves.toMatchInlineSnapshot(`
    "var myNumber: Float;
    var myString: String;
    var myBoolean: Bool;
    var myUndefined: Null<Any>;
    var myVoid: () -> Void;
    var myNever: Void;
    var myUnknown: Any;
    var myAny: Any;
    var myAsKeyword = ( [] : Array< String>);
    var myAsyncAwait = @async function () {
        @await  Promise.resolve();
    };
      final myExport = {};
     
     
    class MyReadonlyClass  {
      public function new() {}

        public 
          final myReadonly=  0;
        
        private var myProtected: Null< String>;
    }
    typedef MyReadonlyType = {
        public final myReadonly:  Float;
    };
    var myEqEqEqToken = 3 == "3";
    var myExEqEqToken = 3 != "3";
    var myUndefinedValue = null;
    var myNaN = Math.NaN;
    "
  `);
});
