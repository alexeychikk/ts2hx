import { ts2hx } from '@tests/framework';

test('transforms empty class declaration', () => {
  expect(ts2hx`
export class Foo {}
  `).toMatchInlineSnapshot(`
    "

      class Foo  {
      public function new() {}

    }
      "
  `);
});

test('transforms abstract class declaration', () => {
  expect(ts2hx`
export default abstract class Foo {}
  `).toMatchInlineSnapshot(`
    "

       abstract class Foo  {
    }
      "
  `);
});

test('transforms anonymous class declaration', () => {
  expect(ts2hx`
export default class {};
  `).toMatchInlineSnapshot(`
    "

      class AnonymousClass_0  {
      public function new() {}

    };
      "
  `);
});
