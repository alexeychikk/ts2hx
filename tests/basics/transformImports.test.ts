import { Ts2hx } from '@tests/framework';

test('transforms imports', async () => {
  await expect(
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
  ).resolves.toMatchInlineSnapshot(`
    "/* import './side-effect'; */
    import DefaultExport.default as defaultImport;
    import NamedExports.foo;
    import NamedExports.bar as quz;
    /* import * as allImports from './namedExports'; */
    "
  `);
});

test('transforms module names in local imports', async () => {
  await expect(
    new Ts2hx(`
import { Class } from './utility-types';
  `)
      .addSourceFile('./utility-types.ts', `export type Class = {};`)
      .run(),
  ).resolves.toMatchInlineSnapshot(`
    "import Utility_types.Class;
    "
  `);
});

test('transforms module names in node_module imports', async () => {
  await expect(
    new Ts2hx(`
import type { Class } from 'utility-types';
  `)
      .addSourceFile(
        './node_modules/utility-types/index.d.ts',
        `export type Class = { foo: string };`,
      )
      .run(),
  ).resolves.toMatchInlineSnapshot(`
    "import node_modules.utility_types.Index.Class;
    "
  `);
});

test('transforms long and complex import name', async () => {
  await expect(
    new Ts2hx(
      `
import { Class } from './utility-types/01_Hello-world.com/02_foo-bar.dto';
import { type HelloWorld } from '../../hello/world';
  `,
      './foo/bar/baz.ts',
    )
      .addSourceFile(
        './foo/bar/utility-types/01_Hello-world.com/02_foo-bar.dto.ts',
        `export type Class = { foo: string }; export {};`,
      )
      .addSourceFile(
        './hello/world/HelloWorld.ts',
        `export type HelloWorld = { hello: "world" }; export {};`,
      )
      .addSourceFile('./hello/world/index.ts', `export * from './HelloWorld';`)
      .run(),
  ).resolves.toMatchInlineSnapshot(`
    "package foo.bar;

    import foo.bar.utility_types.x_01_Hello_world_com.X_02_foo_bar_dto.Class;
    import hello.world.HelloWorld.HelloWorld;
    "
  `);
});
