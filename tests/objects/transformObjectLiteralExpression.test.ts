import { ts2hx } from '@tests/framework';

test('transforms spread assignment in object literal expression', async () => {
  await expect(ts2hx`
let fooBar = { foo: "bar" };
let barFoo = { bar: "x", foo: "y" };
let single = { ...fooBar };
let double = { ...fooBar, ...barFoo };
let first = { ...fooBar, ...barFoo, foo: 'bar', bar: "baz" };
let middle = { foo: 'bar', ...fooBar, ...barFoo, bar: "baz" };
let last = { foo: 'bar', bar: "baz", ...fooBar, ...barFoo };
let changing = { ...fooBar, foo: 'bar', ...barFoo, bar: "baz", ...barFoo };
let inverted = { foo: 'bar', ...fooBar, bar: "baz", ...barFoo, tuz: "qax" };
let pairs = { foo: 'bar', bar: "baz", ...fooBar, ...barFoo, tuz: "qax", sha: "hoo" };
  `).resolves.toMatchInlineSnapshot(`
    "
    var fooBar = { foo: "bar" };
    var barFoo = { bar: "x", foo: "y" };
    var single = fooBar;
    var double = fooBar.combine(barFoo);
    var first = fooBar.combine(barFoo).combine({ foo: 'bar', bar: "baz"});
    var middle = { foo: 'bar'}.combine(fooBar).combine(barFoo).combine({ bar: "baz"});
    var last = { foo: 'bar', bar: "baz"}.combine(fooBar).combine(barFoo);
    var changing = fooBar.combine({ foo: 'bar'}).combine(barFoo).combine({ bar: "baz"}).combine(barFoo);
    var inverted = { foo: 'bar'}.combine(fooBar).combine({ bar: "baz"}).combine(barFoo).combine({ tuz: "qax"});
    var pairs = { foo: 'bar', bar: "baz"}.combine(fooBar).combine(barFoo).combine({ tuz: "qax", sha: "hoo"});
      "
  `);
});

test('transforms spread assignment of object literal expression', async () => {
  await expect(ts2hx`
let fooBar = { foo: 'bar', ...({ hello: "world" }),  bar: "baz" };
  `).resolves.toMatchInlineSnapshot(`
    "
    var fooBar = { foo: 'bar'}.combine(({ hello: "world" })).combine({  bar: "baz"});
      "
  `);
});
