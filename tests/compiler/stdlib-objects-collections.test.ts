import { compileSources } from './helpers';

async function moduleOf(lines: string[]): Promise<string> {
  const { code, diagnostics } = await compileSources({
    'main.ts': lines.join('\n'),
  });
  expect(diagnostics).toEqual([]);
  return code['Main_2.hx'];
}

describe('stdlib: objects, collections and JSON', () => {
  it('maps Map, Set and their weak forms to JsMap and JsSet', async () => {
    const hx = await moduleOf([
      "const m = new Map<string, number>([['a', 1]]);",
      'const s = new Set<number>([1, 2]);',
      'const w = new WeakMap<object, string>();',
      'const ws = new WeakSet<object>();',
      "console.log(m.set('b', 2).get('a'), m.has('z'), m.delete('a'), m.size, s.add(3).has(3), w, ws);",
    ]);
    expect(hx).toContain('var m:ts2hx.JsMap<String, Float>;');
    expect(hx).toContain('var s:ts2hx.JsSet<Float>;');
    expect(hx).toContain('var w:ts2hx.JsMap<Dynamic, String>;');
    expect(hx).toContain('var ws:ts2hx.JsSet<Dynamic>;');
    expect(hx).toContain(
      'm = new ts2hx.JsMap<String, Float>([[(cast "a" : Dynamic), (cast 1.0 : Dynamic)]]);',
    );
    expect(hx).toContain('s = new ts2hx.JsSet<Float>([1.0, 2.0]);');
    expect(hx).toContain('m.set("b", 2.0).get("a"), m.has("z"), m.delete("a")');
    expect(hx).toContain('ts2hx.Console.inspectNumber(m.size)');
    expect(hx).toContain('s.add(3.0).has(3.0)');
  });

  it('iterates and spreads maps, sets and their iterators as arrays', async () => {
    const hx = await moduleOf([
      'const m = new Map<string, number>();',
      'const s = new Set<string>();',
      'for (const [k, v] of m) console.log(k, v);',
      'for (const x of s) console.log(x);',
      'console.log([...s], Array.from(m.keys()), [...m.values()]);',
      'm.forEach((v, k) => console.log(k, v));',
      'const copy = new Set(s);',
    ]);
    expect(hx).toContain('in m.entries().toArray()');
    expect(hx).toContain('for (x in s.values().toArray())');
    expect(hx).toContain('m.keys().toArray()');
    expect(hx).toContain('m.values().toArray()');
    expect(hx).toContain(
      'm.forEach(function(v:Float, k:String, __unused_2:ts2hx.JsMap<String, Float>):Void {',
    );
    expect(hx).toContain('new ts2hx.JsSet<String>(s.values().toArray())');
  });

  it('enumerates non-dictionary objects through ts2hx.Obj', async () => {
    const hx = await moduleOf([
      'interface O { b: number; a?: number }',
      'const o: O = { b: 1, a: 2 };',
      'for (const k in o) console.log(k);',
      "console.log('a' in o, delete o.a, Object.keys(o), Object.values(o), Object.entries(o));",
      'const merged = Object.assign({}, o, { c: 3 });',
      "console.log(Object.fromEntries([['x', 1]]), Object.freeze(o), merged);",
    ]);
    expect(hx).toContain('for (k in ts2hx.Obj.keys(o))');
    expect(hx).toContain(
      'ts2hx.Obj.has(o, "a"), ts2hx.Obj.delete(o, "a"), ts2hx.Obj.keys(o), ts2hx.Obj.values(o), ts2hx.Obj.entries(o)',
    );
    expect(hx).toContain('merged = ts2hx.Obj.assign({}, [o, {c: 3.0}]);');
    expect(hx).toContain('ts2hx.Obj.fromEntries(');
    expect(hx).toContain('ts2hx.Obj.freeze(o)');
  });

  it('records the key order of object literals with two or more fields', async () => {
    const hx = await moduleOf([
      'const one = { z: 1 };',
      'const two = { b: 1, a: 2 };',
      'console.log(one, two);',
    ]);
    expect(hx).toContain('one = {z: 1.0};');
    expect(hx).toContain(
      'two = ts2hx.Obj.literal({b: 1.0, a: 2.0}, ["b", "a"]);',
    );
  });

  it('declares the JS name and own field order of project classes', async () => {
    const hx = await moduleOf([
      'class P { z = 1; #hidden = 2; declare d: number; static s = 3; constructor(public y: number) {} }',
      'class Q extends P { w = 0; }',
      'console.log(new Q(1));',
    ]);
    expect(hx).toContain(
      'private static final __ts2hx_class:Bool = ts2hx.Obj.declareClass(Main_2.P, "P", ["y", "z"]);',
    );
    expect(hx).toContain(
      'private static final __ts2hx_class:Bool = ts2hx.Obj.declareClass(Main_2.Q, "Q", ["w"]);',
    );
  });

  it('binds JSON and converts casts to a record into a dictionary', async () => {
    const hx = await moduleOf([
      'const o = { b: 1, a: 2 };',
      "console.log(JSON.stringify(o), JSON.stringify(o, ['a'], 2), JSON.stringify(o, (k, v) => v, '\\t'));",
      "const r = JSON.parse('{}', (k, v) => v) as Record<string, number>;",
      'console.log(r);',
    ]);
    expect(hx).toContain('ts2hx.Json.stringify(o)');
    expect(hx).toContain('ts2hx.Json.stringify(o, ["a"], 2.0)');
    expect(hx).toContain('r = ts2hx.Dict.from(ts2hx.Json.parse("{}", ');
  });
});
