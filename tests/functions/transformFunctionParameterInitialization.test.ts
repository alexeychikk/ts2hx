import { ts2hx } from '@tests/framework';

test('save simple parameter initialization', async () => {
  await expect(ts2hx`
  function foo(a = true, b = false, c = 1, d = 'foo', e = \`null\`, f = null, g = undefined) {
  }
`).resolves.toMatchInlineSnapshot(`
    "function foo(a =  true, b =  false, c =  1, d =  'foo', e =  "null", f =  null, g =  null) {
    }
    "
  `);
});

test('transform dynamic parameter initialization', async () => {
  await expect(ts2hx`
  const bar = 'bar';
  function foo(a = !true, b = 1 + 1, c = \`foo\${bar}\`, d = {}, e = [], f = () => {}, g = foo()) {
  }
`).resolves.toMatchInlineSnapshot(`
    "final bar = 'bar';
    function foo(param_1, param_2, param_3, param_4, param_5, param_6, param_7) {
        var a = param_1 ?? !true;
        var b = param_2 ?? 1 + 1;
        var c = param_3 ?? 'foo\${bar}';
        var d = param_4 ?? {};
        var e = param_5 ?? [];
        var f = param_6 ?? (function () { });
        var g = param_7 ??  foo();
    }
    "
  `);
});
