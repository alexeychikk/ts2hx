import { ts2hx } from '@tests/framework';

test('transforms binding patterns in variable declarations', async () => {
  await expect(ts2hx`
  const { foo: bar = 'foo' } = obj;
  const [first = '', , third = 0, { foo = 'foo' } = {}, ...rest] = arr;
  let { foo: { bar: baz } } = obj;
  const { foo: { bar: [baz1 = 'baz1', { baz2 = 0 } = {}] = [] } = {} } = obj ?? {};
  const { 'foo': foo = 'foo', 0: bar = 'bar' } = obj;
  const { [foo1 + 'foo']: { [bar1]: baz = 'baz' }, [foo2]: [bar2] = ['bar2'] } = obj;
  const { [foo1 + 'foo']: { [bar1]: baz = 'baz' }, 'foo': foo, '0': first, bar, ...rest } = obj;
  const { 
    foo = () => {
      const { innerProp = 'foo' } = innerObj;
    },
    bar: { baz = 'baz' }
  } = obj;
`).resolves.toMatchInlineSnapshot(`
    "final bar = obj.foo ?? 'foo';
    final first = arr[0] ?? '';
    final third = arr[2] ?? 0;
    final foo = (arr[3] ?? {}).foo ?? 'foo';
    final rest = arr.slice(4);
    var baz = obj.foo.bar;
    final baz1 = (((obj ?? {}).foo ?? {}).bar ?? [])[0] ?? 'baz1';
    final baz2 = ((((obj ?? {}).foo ?? {}).bar ?? [])[1] ?? {}).baz2 ?? 0;
    final foo = Reflect.field(obj, 'foo') ?? 'foo';
    final bar = Reflect.field(obj, '0') ?? 'bar';
    final baz = Reflect.field(Reflect.field(obj, foo1 + 'foo'), bar1) ?? 'baz';
    final bar2 = (Reflect.field(obj, foo2) ?? ['bar2'])[0];
    final baz = Reflect.field(Reflect.field(obj, foo1 + 'foo'), bar1) ?? 'baz';
    final foo = Reflect.field(obj, 'foo');
    final first = Reflect.field(obj, '0');
    final bar = obj.bar;
    final rest = Ts2hx.rest(obj, [foo1 + 'foo', 'foo', '0', 'bar']);
    final foo = obj.foo ?? function () {
        final innerProp = innerObj.innerProp ?? 'foo';
    };
    final baz = obj.bar.baz ?? 'baz';
    "
  `);
});

test('transforms variable declaration with binding pattern inside for-of', async () => {
  await expect(ts2hx`
  for (const { foo, bar } of fooBars) {
    for (const [{ foo1, bar1 }] of fooBars) {}
  }
`).resolves.toMatchInlineSnapshot(`
    "for ( fooBarsItem_1 in  fooBars)  {
        final foo = fooBarsItem_1.foo;
        final bar = fooBarsItem_1.bar;
        for ( fooBarsItem_2 in  fooBars)  {
            final foo1 = fooBarsItem_2[0].foo1;
            final bar1 = fooBarsItem_2[0].bar1;
        }
    }
    "
  `);
});

test('transforms variable declaration with binding pattern inside catch clause', async () => {
  await expect(ts2hx`
  try {}
  catch ({ message }) {
    console.log(message);
  }
`).resolves.toMatchInlineSnapshot(`
    "try { }
    catch (error_1) {
        final message = error_1.message;
        
        trace(message);
    }
    "
  `);
});
