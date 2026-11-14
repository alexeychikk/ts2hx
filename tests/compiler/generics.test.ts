import { compileSources } from './helpers';

async function moduleOf(source: string): Promise<string> {
  const { code, diagnostics } = await compileSources({ 'main.ts': source });
  expect(diagnostics).toEqual([]);
  return code['Main_2.hx'];
}

describe('frontend: generics and advanced types', () => {
  it('keeps type parameters constrained by project classes and typedefs', async () => {
    const hx = await moduleOf(
      [
        'interface Named { name: string }',
        'class Shape { area(): number { return 1; } }',
        'export function greet<T extends Named>(item: T): string { return item.name; }',
        'export function total<S extends Shape>(shapes: S[]): number { return shapes.length; }',
        'export function id<T>(value: T): T { return value; }',
        'export class Registry<T extends Named = Named> { items: T[] = []; }',
      ].join('\n'),
    );
    expect(hx).toContain('function greet<T:Main_2.Named>(item:T):String');
    expect(hx).toContain(
      'function total<S:Main_2.Shape>(shapes:Array<S>):Float',
    );
    expect(hx).toContain('function id<T>(value:T):T');
    expect(hx).toContain('class Registry<T:Main_2.Named>');
  });

  it('erases type parameters with other constraints, and their class arguments', async () => {
    const hx = await moduleOf(
      [
        'export function longest<T extends { length: number }>(a: T, b: T): T { return b.length > a.length ? b : a; }',
        'export function clamp<N extends number>(v: N, max: number): number { return v > max ? max : v; }',
        'export class Catalog<K, T extends { id: number }> { constructor(readonly key: K, readonly entry: T) {} }',
        "export const c = new Catalog('k', { id: 1 });",
      ].join('\n'),
    );
    expect(hx).toContain('function longest(a:Dynamic, b:Dynamic):Dynamic');
    expect(hx).toContain('function clamp(v:Dynamic, max:Float):Float');
    expect(hx).toContain('return v > max ? max : v;');
    expect(hx).toContain('class Catalog<K>');
    expect(hx).toContain('var c:Main_2.Catalog<String>;');
  });

  it('erases type parameters of arrows and of generic function values', async () => {
    const hx = await moduleOf(
      [
        'function wrap<T>(value: T): T[] { return [value]; }',
        'export const pair = <K, V>(key: K, value: V) => ({ key, value });',
        'export const ref = wrap;',
      ].join('\n'),
    );
    expect(hx).toContain(
      'var pair:(key:Dynamic, value:Dynamic) -> { var key:Dynamic; var value:Dynamic; };',
    );
    expect(hx).toContain('var ref:(value:Dynamic) -> Array<Dynamic>;');
    expect(hx).toContain('function wrap<T>(value:T):Array<T>');
  });

  it('reads and writes members by a computed key through reflection', async () => {
    const hx = await moduleOf(
      [
        'interface Config { host: string; port: number }',
        'export function get<T, K extends keyof T>(o: T, k: K): T[K] { return o[k]; }',
        'export function set<T, K extends keyof T>(o: T, k: K, v: T[K]): void { o[k] = v; }',
        "export function port(c: Config, k: 'port'): number { c[k] += 1; return c[k]; }",
      ].join('\n'),
    );
    expect(hx).toContain(
      'return Reflect.getProperty(o, ts2hx.Ts2hx.string(k));',
    );
    expect(hx).toContain(
      'ts2hx.Ts2hx.setProperty(o, ts2hx.Ts2hx.string(k), v);',
    );
    expect(hx).toContain('return (cast Reflect.getProperty(c, k) : Float);');
    expect(hx).toContain(
      'ts2hx.Ts2hx.setProperty(c, k, ((cast Reflect.getProperty(c, k) : Float)) + 1.0);',
    );
  });

  it('spreads values of unknown keys by reflection, in source order', async () => {
    const hx = await moduleOf(
      'export function merge<A extends object>(a: A, b: number) { return { x: b, ...a }; }',
    );
    expect(hx).toMatch(
      /final __spread_\d+:Dynamic = \{\};\s*Reflect\.setField\(__spread_\d+, "x", b\);\s*ts2hx\.Ts2hx\.assign\(__spread_\d+, a\);/,
    );
  });

  it('pads callbacks passed to project functions to the expected arity', async () => {
    const hx = await moduleOf(
      [
        'function each<T>(items: T[], fn: (item: T, index: number) => void): void { items.forEach((x, i) => fn(x, i)); }',
        "each(['a'], (s) => console.log(s));",
      ].join('\n'),
    );
    expect(hx).toMatch(
      /each\(\["a"\], function\(s:String, __unused_\d+:Float\):Void/,
    );
  });

  it('erases type parameters whose constraint refers back to them', async () => {
    const hx = await moduleOf(
      [
        'export class TreeNode<T extends TreeNode<T>> { children: T[] = []; }',
        'export class Leaf extends TreeNode<Leaf> {}',
      ].join('\n'),
    );
    expect(hx).toContain('class TreeNode {');
    expect(hx).toContain('class Leaf extends Main_2.TreeNode {');
  });

  it('casts the result of a method returning `this` to the receiver class', async () => {
    const hx = await moduleOf(
      [
        'class Base { self(): this { return this; } }',
        'class Sub extends Base { tag = 1; }',
        'export const tag = new Sub().self().tag;',
      ].join('\n'),
    );
    expect(hx).toContain(
      'tag = ((cast new Main_2.Sub().self() : Main_2.Sub)).tag;',
    );
  });
});
