import { A, type B } from './nested';
import type { D as Foo } from './nested';
import CRenamed from './nested/VariousExports';
import * as AllImports from './nested';
import './nested';

export class ImportsShowcase {
  static main() {
    const foo: Foo = 'bar';
    const bar: B = { foo: 'bar' };
    console.log(A, CRenamed, AllImports.A, foo, bar);
  }
}
