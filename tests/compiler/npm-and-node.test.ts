import * as path from 'node:path';

import { compileProject } from '@src/compiler';
import { externClassName, ExternRegistry } from '@src/compiler/stdlib/npm';

import { createProject } from './helpers';

const NODE_TYPES = path.resolve(__dirname, '../../node_modules/@types');

const FAKE_LODASH = {
  'node_modules/lodash/package.json': '{"name":"lodash","types":"index.d.ts"}',
  'node_modules/lodash/index.d.ts': [
    'declare const _: {',
    '  chunk<T>(xs: T[], size?: number): T[][];',
    '  map<T, R>(xs: T[], f: (x: T, i: number, all: T[]) => R): R[];',
    '  debounce<F>(f: F, wait: number): F;',
    '  after<F>(n: number, f: F): F;',
    '};',
    'export = _;',
  ].join('\n'),
};

const FAKE_PACKAGE = {
  'node_modules/@acme/fake-pkg/package.json':
    '{"name":"@acme/fake-pkg","types":"index.d.ts"}',
  'node_modules/@acme/fake-pkg/index.d.ts': [
    'export interface Widget { id: number; parts: Widget[] }',
    'export declare function greet(name: string, times?: number, ...rest: string[]): string;',
    'export declare function makeWidget(): Widget;',
    'export declare function over(a: string): void;',
    'export declare function over(a: number): void;',
    'export declare const version: string;',
  ].join('\n'),
};

async function compile(files: Record<string, string>) {
  const project = createProject(files, { typeRoots: [NODE_TYPES] });
  const result = await compileProject({
    program: project.program,
    entry: project.file('main.ts'),
  });
  const code = Object.fromEntries(result.modules.map((m) => [m.path, m.code]));
  const warnings = result.diagnostics.map((d) => d.message);
  return { code, warnings, main: code['Main_2.hx'] };
}

describe('npm packages', () => {
  it('calls the ts2hx.npm shims, padding callbacks to the shim arity', async () => {
    const { main, warnings } = await compile({
      'main.ts': [
        "import _, { chunk } from 'lodash';",
        'const xs = [1, 2, 3];',
        'console.log(chunk(xs, 2), _.map(xs, (x) => x * 2));',
      ].join('\n'),
      ...FAKE_LODASH,
    });
    expect(warnings).toEqual([]);
    expect(main).toContain('ts2hx.npm.Lodash.chunk(xs, 2.0)');
    expect(main).toMatch(
      /ts2hx\.npm\.Lodash\.map\(xs, function\(x:Float, __unused_\d+:Dynamic, __unused_\d+:Dynamic\):Float/,
    );
  });

  it('reports shim members it lacks, once more in the per-run summary', async () => {
    const { main, warnings } = await compile({
      'main.ts': [
        "import _ from 'lodash';",
        'const f = _.debounce(() => 1, 10);',
        'console.log(f, _.after(2, f));',
      ].join('\n'),
      ...FAKE_LODASH,
    });
    expect(main).toContain('ts2hx.Ts2hx.unsupported("lodash.debounce has no');
    expect(warnings).toContain(
      'TODO(ts2hx): unsupported members in this run: lodash.after, lodash.debounce',
    );
  });

  it('generates a JS extern for a package without a shim and #error elsewhere', async () => {
    const { main, code, warnings } = await compile({
      'main.ts': [
        "import { greet, over, version } from '@acme/fake-pkg';",
        "import * as fake from '@acme/fake-pkg';",
        "console.log(greet('a'), fake.greet('b', 2), version);",
        "over('x');",
      ].join('\n'),
      ...FAKE_PACKAGE,
    });
    expect(warnings).toEqual([]);
    expect(main).toContain('externs.Acme_fake_pkg.greet("a")');
    expect(main).toContain('externs.Acme_fake_pkg.greet("b", 2.0)');
    expect(code['externs/Acme_fake_pkg.hx']).toBe(
      [
        'package externs;',
        '',
        '#if js',
        '@:jsRequire("@acme/fake-pkg")',
        'extern class Acme_fake_pkg {',
        '\tstatic function greet(name:String, ?times:Float, rest:haxe.extern.Rest<Dynamic>):String;',
        '\tstatic var version:Dynamic;',
        '\tstatic var over:Dynamic;',
        '}',
        '#else',
        '#error "npm package \\"@acme/fake-pkg\\" is only available on the JS target: ts2hx has no cross-target shim for it"',
        '#end',
        '',
      ].join('\n'),
    );
  });

  it('maps types declared by a package to Dynamic', async () => {
    const { main } = await compile({
      'main.ts': [
        "import { makeWidget, type Widget } from '@acme/fake-pkg';",
        'const widget: Widget = makeWidget();',
        'console.log(widget.parts.length);',
      ].join('\n'),
      ...FAKE_PACKAGE,
    });
    expect(main).toMatch(/var widget:Dynamic;|final widget:Dynamic/);
  });

  it('rejects a namespace import used as a value', async () => {
    const { main, warnings } = await compile({
      'main.ts': [
        "import * as fake from '@acme/fake-pkg';",
        'console.log(fake);',
      ].join('\n'),
      ...FAKE_PACKAGE,
    });
    expect(main).toContain('ts2hx.Ts2hx.unsupported(');
    expect(warnings).toContain(
      'TODO(ts2hx): npm package "@acme/fake-pkg" used as a value is not supported yet',
    );
  });

  it('leaves Node built-in modules out of scope rather than externs', async () => {
    const { code, warnings } = await compile({
      'main.ts': [
        "import { readFileSync } from 'fs';",
        "console.log(readFileSync('x', 'utf8'));",
      ].join('\n'),
    });
    expect(Object.keys(code).some((p) => p.startsWith('externs/'))).toBe(false);
    expect(warnings).toContain(
      'TODO(ts2hx): unsupported members in this run: "node:fs".readFileSync',
    );
  });

  it('names extern classes after the package', () => {
    expect(externClassName('lodash.debounce')).toBe('Lodash_debounce');
    expect(externClassName('@scope/my-pkg')).toBe('Scope_my_pkg');
    expect(externClassName('2d-geo')).toBe('Pkg_2d_geo');
    expect(ExternRegistry.path(['app'], 'left-pad')).toEqual({
      pack: ['app', 'externs'],
      module: 'Left_pad',
      name: 'Left_pad',
    });
  });
});

describe('Node built-ins', () => {
  it('binds process.argv, process.exit and process.stdout.write to ts2hx.Process', async () => {
    const { main, warnings } = await compile({
      'main.ts': [
        'console.log(process.argv.slice(2));',
        "process.stdout.write('a');",
        "process.stderr.write('b');",
        'process.exit(3);',
      ].join('\n'),
    });
    expect(warnings).toEqual([]);
    expect(main).toContain('ts2hx.JsArray.slice(ts2hx.Process.argv, 2.0)');
    expect(main).toContain('ts2hx.Process.write(ts2hx.Process.stdout, "a")');
    expect(main).toContain('ts2hx.Process.write(ts2hx.Process.stderr, "b")');
    expect(main).toContain('ts2hx.Process.exit(3.0)');
  });
});

describe('decorators', () => {
  it('keeps them as a TODO plus @:ts.decorator metadata, without calling them', async () => {
    const { main, warnings } = await compile({
      'main.ts': [
        'function sealed(_t: Function, _c: ClassDecoratorContext): void {}',
        'function tag(_n: string) {',
        '  return (_t: Function, _c: ClassMethodDecoratorContext): void => {};',
        '}',
        '@sealed',
        'class Greeter {',
        "  @tag('hi')",
        '  greet(): string {',
        "    return 'hi';",
        '  }',
        '}',
        'console.log(new Greeter().greet());',
      ].join('\n'),
    });
    expect(main).toContain(
      '// TODO(ts2hx): decorator @sealed is not executed\n@:ts.decorator("sealed")\nclass Greeter {',
    );
    expect(main).toContain(
      "\t// TODO(ts2hx): decorator @tag('hi') is not executed\n\t@:ts.decorator(\"tag('hi')\")\n\tpublic function greet():String {",
    );
    expect(warnings).toEqual([
      "TODO(ts2hx): decorator @tag('hi') is not executed",
      'TODO(ts2hx): decorator @sealed is not executed',
    ]);
  });
});

describe('out-of-scope constructs', () => {
  it('turns a class prototype access into Unsupported', async () => {
    const { main } = await compile({
      'main.ts': [
        'class A {}',
        'function patch(): void {',
        '  (A.prototype as any).x = 1;',
        '}',
        'console.log(typeof patch);',
      ].join('\n'),
    });
    expect(main).toContain(
      'ts2hx.Ts2hx.unsupported("class prototypes are out of scope (ADR 0005)")',
    );
  });
});
