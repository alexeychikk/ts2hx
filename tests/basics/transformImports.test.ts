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
