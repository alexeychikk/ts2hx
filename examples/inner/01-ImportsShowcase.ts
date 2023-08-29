import { A, type B } from './Nested';
import type { D as Foo } from './Nested';
import CRenamed from './Nested/VariousExports';
import * as AllImports from './Nested';
import './Nested';

export class ImportsShowcase {
  static main() {
    const foo: Foo = 'bar';
    const bar: B = { foo: 'bar' };
    console.log(A, CRenamed, AllImports.A, foo, bar);
  }
}
