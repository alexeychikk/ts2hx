import * as fs from 'node:fs';
import * as path from 'node:path';

import type { Converter } from '../../conformance/runner';

/** Stands in for the compiler: copies hand-written `.hx` files from `haxeDir/<case id>/`. */
export function fakeConverter(haxeDir: string): Converter {
  return ({ caseId, outDir, rootPackage }) => {
    const sourceDir = path.join(haxeDir, caseId);
    const targetDir = path.join(outDir, 'src', ...rootPackage.split('.'));
    fs.mkdirSync(targetDir, { recursive: true });
    for (const file of fs.readdirSync(sourceDir)) {
      const code = fs.readFileSync(path.join(sourceDir, file), 'utf8');
      fs.writeFileSync(
        path.join(targetDir, file),
        code.replace('__PACKAGE__', rootPackage),
      );
    }
    return Promise.resolve();
  };
}
