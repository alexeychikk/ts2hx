import { ts2hx } from '@tests/framework';

test('transforms empty class declaration', async () => {
  await expect(ts2hx`
export class Foo {}
  `).resolves.toMatchInlineSnapshot(`
    "

      class Foo  {
      public function new() {}

    }
      "
  `);
});

test('transforms abstract class declaration', async () => {
  await expect(ts2hx`
export default abstract class Foo {}
  `).resolves.toMatchInlineSnapshot(`
    "

       abstract class Foo  {
    }
      "
  `);
});

test('transforms anonymous class declaration', async () => {
  await expect(ts2hx`
export default class {};
  `).resolves.toMatchInlineSnapshot(`
    "

      class AnonymousClass_0  {
      public function new() {}

    };
      "
  `);
});
