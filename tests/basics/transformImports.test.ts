import { Ts2hx } from '@tests/framework';

test('transforms imports', () => {
  expect(
    new Ts2hx(`
import './side-effect';
import defaultImport from './defaultExport';
import { foo, bar as quz } from './namedExports';
import * as allImports from './namedExports'; 
`)
      .addSourceFile('./side-effect.ts', `console.log();`)
      .addSourceFile('./defaultExport.ts', `export default { foo: "bar" };`)
      .addSourceFile(
        './namedExports.ts',
        `export const foo = { foo: "foo" }; 
         export const bar = { bar: "bar" };`,
      )
      .run(),
  ).toMatchInlineSnapshot(`
    "
    /* import './side-effect'; */
    import DefaultExport.default as defaultImport;
    import NamedExports.foo;
    import NamedExports.bar as quz;
    /* import * as allImports from './namedExports'; */ 
    "
  `);
});

test('transforms module names in local imports', () => {
  expect(
    new Ts2hx(`
import { Class } from './utility-types';
  `)
      .addSourceFile('./utility-types.ts', `export type Class = {};`)
      .run(),
  ).toMatchInlineSnapshot(`
    "
    import Utility_types.Class;
      "
  `);
});

test('transforms module names in node_module imports', () => {
  expect(
    new Ts2hx(`
import type { Class } from 'utility-types';
  `)
      .addSourceFile(
        './node_modules/utility-types/index.d.ts',
        `export type Class = { foo: string };`,
      )
      .run(),
  ).toMatchInlineSnapshot(`
    "
    import node_modules.utility_types.Class;
      "
  `);
});

test('transforms long and complex import name', () => {
  expect(
    new Ts2hx(`
import { Class } from './utility-types/hello-world/foo-bar';
  `)
      .addSourceFile(
        './utility-types/hello-world/foo-bar.d.ts',
        `export type Class = { foo: string }; export {};`,
      )
      .run(),
  ).toMatchInlineSnapshot(`
    "
    import utility_types.hello_world.Foo_bar.Class;
      "
  `);
});
