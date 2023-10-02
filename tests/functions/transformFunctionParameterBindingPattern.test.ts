import { ts2hx } from '@tests/framework';

test('transforms binding patterns in parameter declarations in function', async () => {
  await expect(ts2hx`
function foo({ bar }: { bar: string }, [baz = bar]: string[], ...rest: string[]) {
}
const foo1 = function({ bar = 'bar' }: { bar?: string } = {}, [baz]: number[] = [], id = bar): void {
};
class Foo {
  foo = function<T extends string = string>(baz: T, { bar = baz }: { bar?: string }): T  {
    return baz;
  }
}
`).resolves.toMatchInlineSnapshot(`
    "function foo(param_1:  {
        public var bar:  String;
    }, param_2:  Array< String>, ...rest:  String) {
        var bar = param_1.bar;
        var baz = param_2[0] ?? bar;
    }
    final foo1 = function (param_3:  {
        public var ?bar:  String;
    }, param_4:  Array< Float>, param_5): Void {
        var bar = (param_3 ?? {}).bar ?? 'bar';
        var baz = (param_4 ?? [])[0];
        var id = param_5 ?? bar;
    };
    class Foo  {
      public function new() {}

        public var foo=  function <T :  String>(baz:  T, param_6:  {
            public var ?bar:  String;
        }): T {
            final bar = param_6.bar ?? baz;
            return baz;
        };
    }
    "
  `);
});

test('transforms binding patterns in parameter declarations in arrow function', async () => {
  await expect(ts2hx`
const fooArrow = ({ bar }: { bar: string }, [baz = bar]: string[], ...rest: string[]): null => null;
const fooArrow1 = ({ bar = 'bar' }: { bar?: string } = {}, [baz]: number[] = [], id?: string): void => {
};
class Foo {
  foo = ({ bar = 'bar' }: { bar?: string }): null => null;
}
`).resolves.toMatchInlineSnapshot(`
    "final fooArrow = function (param_1:  {
        public var bar:  String;
    },  param_2:  Array< String>,  ...rest:  String):  Null<Any> {
        var bar = param_1.bar;
        var baz = param_2[0] ?? bar;
        return null;
    };
    final fooArrow1 = function (param_3:  {
        public var ?bar:  String;
    },  param_4:  Array< Float>,  ?id:  String):  Void {
        var bar = (param_3 ?? {}).bar ?? 'bar';
        var baz = (param_4 ?? [])[0];
    };
    class Foo  {
      public function new() {}

        public var foo=  function (param_5:  {
            public var ?bar:  String;
        }):  Null<Any> {
            var bar = param_5.bar ?? 'bar';
            return null;
        };
    }
    "
  `);
});

test('transforms binding patterns in parameter declarations in method', async () => {
  await expect(ts2hx`
class Foo {
  foo([baz]: string[], { bar: { foobar = baz } }: { bar: { foobar: string; } }): string  {
    return baz;
  }
}
`).resolves.toMatchInlineSnapshot(`
    "class Foo  {
      public function new() {}

        public function foo(param_1:  Array< String>,  param_2:  {
            public var bar:  {
                public var foobar:  String;
            };
        }):  String {
            final baz = param_1[0];
            final foobar = param_2.bar.foobar ?? baz;
            return baz;
        }
    }
    "
  `);
});

test('transforms binding patterns in parameter declarations in set accessor', async () => {
  await expect(ts2hx`
class Foo {
  _bar: { bar: string } = { bar: 'bar' };
  set Bar({ bar = '' } : { bar?: string }) {
    this._bar = { bar };
  }
}
`).resolves.toMatchInlineSnapshot(`
    "class Foo  {
      public function new() {}

        public var _bar:  {
            public var bar:  String;
        }=  { bar: 'bar' };
        public var Bar(never, set):  {
            public var ?bar:  String;
        };
        public function set_Bar(param_1:  {
            public var ?bar:  String;
        }){
            var bar = param_1.bar ?? '';
    return (
            this._bar = { bar: bar } );}
    }
    "
  `);
});

test('transforms binding patterns in parameter declarations in constructor', async () => {
  await expect(ts2hx`
class Foo {
  _bar: { bar: string } = { bar: 'bar' };
  constructor({ bar = '' } : { bar?: string }) {
    this._bar = { bar };
  }
}
`).resolves.toMatchInlineSnapshot(`
    "class Foo  {
        public var _bar:  {
            public var bar:  String;
        }=  { bar: 'bar' };
        public function new(param_1:  {
            public var ?bar:  String;
        }) {
            var bar = param_1.bar ?? '';

            this._bar = { bar: bar };
        }
    }
    "
  `);
});
