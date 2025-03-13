import { ts2hx } from '@tests/framework';

test('add @:async and @:await metadata to functions', async () => {
  await expect(ts2hx`
async function foo() {
  const data = await fetchData();
  return data;
}

class Bar {
  async method() {
    return await fetchSomething();
  }
}

const asyncArrow = async () => await fetchData();
const asyncFn = async function() { return await fetchMore(); };
`).resolves.toMatchInlineSnapshot(`
    "function foo() {
        final data = fetchData();
        return data;
    }
    class Bar  {
      public function new() {}

        
        public function method() {
            return  fetchSomething();
        }
    }
    final asyncArrow = () ->  fetchData();
    final asyncFn = function() { return  fetchMore(); };
    "
  `);
});
