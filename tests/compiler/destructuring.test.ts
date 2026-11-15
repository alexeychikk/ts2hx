import { compileSources } from './helpers';

async function moduleOf(source: string): Promise<string> {
  const { code, diagnostics } = await compileSources({ 'main.ts': source });
  expect(diagnostics).toEqual([]);
  return code['Main_2.hx'];
}

describe('frontend: destructuring, spread and optional chaining', () => {
  it('binds object and array patterns through one stored source', async () => {
    const hx = await moduleOf(
      [
        'function point(): { x: number; y: number } { return { x: 1, y: 2 }; }',
        'function main(): void {',
        '  const { x, y: why } = point();',
        '  const [first, , third = 9, ...rest] = [1, 2, 3, 4];',
        '  console.log(x, why, first, third, rest);',
        '}',
      ].join('\n'),
    );
    expect(hx).toContain(
      'final __pattern_1:{ var x:Float; var y:Float; } = point();',
    );
    expect(hx).toContain('final why:Float = __pattern_1.y;');
    expect(hx).toContain(
      'final __default_3:Dynamic = 2 < __pattern_2.length ? __pattern_2[2] : null;',
    );
    expect(hx).toContain('__default_3 == null ? 9.0 : __default_3;');
    expect(hx).toContain('final rest:Array<Dynamic> = __pattern_2.slice(3);');
  });

  it('destructures parameters, for-of items and assignments', async () => {
    const hx = await moduleOf(
      [
        'function sum({ a, b = 2 }: { a: number; b?: number }): number { return a + b; }',
        'function main(): void {',
        '  for (const [k, v] of [[1, 2]]) console.log(k, v);',
        '  let p = 1;',
        '  let q = 2;',
        '  [p, q] = [q, p];',
        '  console.log(sum({ a: 1 }), p, q);',
        '}',
      ].join('\n'),
    );
    expect(hx).toContain(
      'function sum(__param_1:{ var a:Float; @:optional var b:Null<Float>; }):Float {',
    );
    expect(hx).toContain('__default_2 == null ? 2.0 : __default_2;');
    expect(hx).toContain('for (__item_3 in [[1.0, 2.0]]) {');
    expect(hx).toContain('final k:Float = __item_3[0];');
    expect(hx).toContain(
      'final __pattern_4:Array<Dynamic> = [(cast q : Dynamic), (cast p : Dynamic)];',
    );
    expect(hx).toContain('p = __pattern_4[0];');
    expect(hx).toContain('q = __pattern_4[1];');
  });

  it('spreads objects with a static key order and dictionaries entry by entry', async () => {
    const hx = await moduleOf(
      [
        'function main(): void {',
        '  const base = { a: 1, b: 2 };',
        '  const merged = { b: 0, ...base, c: 3 };',
        '  const scores: Record<string, number> = { ann: 1 };',
        '  const more: Record<string, number> = { ...scores, bob: 2 };',
        '  console.log(merged.a, merged.b, merged.c, more["bob"]);',
        '}',
      ].join('\n'),
    );
    expect(hx).toContain(
      '= ts2hx.Obj.literal({b: base.b, a: base.a, c: 3.0}, ["b", "a", "c"]);',
    );
    expect(hx).toContain('for (__key_2 in scores.keys()) {');
    expect(hx).toContain('__dict_1.set(__key_2, scores.get(__key_2));');
    expect(hx).toContain('__dict_1.set("bob", 2.0);');
  });

  it('guards optional chains on a value read once', async () => {
    const hx = await moduleOf(
      [
        'interface Node { value: number; next?: Node; visit?: (d: number) => string }',
        'function find(): Node | undefined { return undefined; }',
        'function main(): void {',
        '  console.log(find()?.next?.value, find()?.visit?.(1));',
        '  console.log(find()?.value ?? -1);',
        '}',
      ].join('\n'),
    );
    expect(hx).toContain('final __chain_1:Main_2.Node = find();');
    expect(hx).toContain('__chain_1 == null ? null : __chain_1.next;');
    expect(hx).toContain(
      'final __chained_3:Null<Float> = __chain_2 == null ? null : __chain_2.value;',
    );
    expect(hx).toContain('__chain_5 == null ? null : __chain_5(1.0);');
    expect(hx).toMatch(
      /\(\{\s*final __chain_\d+:Main_2\.Node = find\(\);[^}]*\}\) \?\? -1\.0/,
    );
    expect(hx).not.toContain('unsupported');
  });

  it('writes logical assignments only when the operator says so', async () => {
    const hx = await moduleOf(
      [
        'function main(): void {',
        '  let maybe: number | null = null;',
        '  maybe ??= 4;',
        "  let text = '';",
        "  text ||= 'filled';",
        '  const arr = [0, 1];',
        '  let i = 0;',
        '  arr[i++] &&= 5;',
        '  console.log(maybe, text, arr);',
        '}',
      ].join('\n'),
    );
    expect(hx).toContain('maybe != null ? maybe : (maybe = 4.0);');
    expect(hx).toContain(
      'ts2hx.Ts2hx.truthyString(text) ? text : (text = "filled");',
    );
    expect(hx).toContain('final __value_1:Int = Std.int(i++);');
    expect(hx).toContain(
      'ts2hx.Num.truthy(arr[__value_1]) ? (arr[__value_1] = 5.0) : arr[__value_1];',
    );
  });
});
