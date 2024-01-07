import { ts2hx } from '@tests/framework';

test('transforms delete expression to Reflect.deleteField', async () => {
  await expect(ts2hx`
let foo = { x: 1, y: 2, z: 3, $$foo$$bar$$: 4 };
let bar = 'z';
delete foo.x;
delete foo['y'];
delete foo[bar];
delete foo.$$foo$$bar$$;
`).resolves.toMatchInlineSnapshot(`
    "var foo = { x: 1, y: 2, z: 3, $_foo__bar__: 4 };
    var bar = 'z';

    Reflect.deleteField(foo,  "x");

    Reflect.deleteField(foo,  'y');

    Reflect.deleteField(foo,  bar);

    Reflect.deleteField(foo,  "$_foo__bar__");
    "
  `);
});
