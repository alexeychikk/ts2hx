import ts from 'typescript';

import { typePath } from '../ir/builders';
import type { HxTypePath } from '../ir/types';
import { isExternalFile } from '../frontend/types';

/** A binding imported from an npm package: `name` is an export, `default` or `*`. */
export interface NpmImport {
  pkg: string;
  name: string;
}

/** A cross-target port of an npm package in the runtime (`ts2hx.npm.*`, ADR 0005). */
export interface NpmShim {
  owner: HxTypePath;
  /** The member a default import names; without it a default import is the namespace. */
  defaultMember?: string;
  /** Supported members, with the arity their callback arguments are padded to (0: none). */
  members: ReadonlyMap<string, number>;
}

function shim(
  name: string,
  members: Record<string, number>,
  defaultMember?: string,
): NpmShim {
  return {
    owner: typePath(['ts2hx', 'npm'], name),
    defaultMember,
    members: new Map(Object.entries(members)),
  };
}

const LODASH = shim('Lodash', {
  chunk: 0,
  first: 0,
  head: 0,
  last: 0,
  compact: 0,
  uniq: 0,
  uniqBy: 1,
  without: 0,
  difference: 0,
  dropRight: 0,
  pull: 0,
  remove: 3,
  times: 1,
  forEach: 3,
  map: 3,
  filter: 3,
  find: 3,
  some: 3,
  flatMap: 3,
  sum: 0,
  sumBy: 1,
  minBy: 1,
  maxBy: 1,
  sortBy: 1,
  orderBy: 1,
  groupBy: 1,
  keyBy: 1,
  pick: 0,
  omit: 0,
  pickBy: 2,
  omitBy: 2,
  mapValues: 3,
  isEmpty: 0,
  isEqual: 0,
  cloneDeep: 0,
  clamp: 0,
  noop: 0,
  identity: 0,
  memoize: 0,
  escapeRegExp: 0,
  capitalize: 0,
});

/** npm packages the runtime ports, by import specifier. */
export const NPM_SHIMS: ReadonlyMap<string, NpmShim> = new Map([
  ['lodash', LODASH],
  ['lodash-es', LODASH],
  [
    'joi',
    shim('Joi', {
      object: 0,
      any: 0,
      string: 0,
      number: 0,
      boolean: 0,
      array: 0,
      valid: 0,
      assert: 0,
    }),
  ],
  [
    'nanoid',
    shim('Nanoid', {
      nanoid: 0,
      customAlphabet: 0,
      customRandom: 1,
      urlAlphabet: 0,
    }),
  ],
  ['seedrandom', shim('SeedRandom', { seedrandom: 0 }, 'seedrandom')],
]);

/** Whether an import specifier names a package rather than a project file or a Node built-in. */
export function isPackageSpecifier(specifier: string): boolean {
  return (
    !specifier.startsWith('.') &&
    !specifier.startsWith('/') &&
    !specifier.startsWith('node:')
  );
}

/** The npm import an alias symbol stands for, if any: Node built-ins (`fs`) are not npm packages. */
export function npmImportOf(
  checker: ts.TypeChecker,
  symbol: ts.Symbol | undefined,
): NpmImport | undefined {
  const declaration = symbol?.declarations?.[0];
  if (!declaration || !(symbol.flags & ts.SymbolFlags.Alias)) {
    return undefined;
  }
  let importDeclaration: ts.ImportDeclaration | ts.JSDocImportTag;
  let name: string;
  if (ts.isImportSpecifier(declaration)) {
    importDeclaration = declaration.parent.parent.parent;
    name = (declaration.propertyName ?? declaration.name).text;
  } else if (ts.isImportClause(declaration)) {
    importDeclaration = declaration.parent;
    name = 'default';
  } else if (ts.isNamespaceImport(declaration)) {
    importDeclaration = declaration.parent.parent;
    name = '*';
  } else {
    return undefined;
  }
  const specifier = importDeclaration.moduleSpecifier;
  if (!ts.isStringLiteral(specifier) || !isPackageSpecifier(specifier.text)) {
    return undefined;
  }
  const module = checker.getSymbolAtLocation(specifier);
  const declarations = module?.declarations ?? [];
  return declarations.length > 0 &&
    declarations.every((d) => isExternalFile(d.getSourceFile().fileName))
    ? { pkg: specifier.text, name }
    : undefined;
}

/** The Haxe class name of a package's extern: `@scope/my-pkg` → `Scope_my_pkg`. */
export function externClassName(pkg: string): string {
  const id = pkg
    .replace(/^@/, '')
    .replace(/[^A-Za-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '');
  const name = /^[0-9]/.test(id) ? `Pkg_${id}` : id || 'Pkg';
  return name[0].toUpperCase() + name.slice(1);
}

/** The externs of the packages without a shim the project reads, collected over all modules. */
export class ExternRegistry {
  private readonly packages = new Map<string, Map<string, string>>();

  /** Records the Haxe declaration of `member` (one `static` line) for package `pkg`. */
  add(pkg: string, member: string, declaration: string): void {
    let members = this.packages.get(pkg);
    if (!members) {
      members = new Map();
      this.packages.set(pkg, members);
    }
    if (!members.has(member)) {
      members.set(member, declaration);
    }
  }

  /** The class path of the extern of `pkg` under `rootPackage`. */
  static path(rootPackage: string[], pkg: string): HxTypePath {
    const name = externClassName(pkg);
    return { pack: [...rootPackage, 'externs'], module: name, name };
  }

  /** One extern module per package: `@:jsRequire` on JS, an `#error` naming the package elsewhere. */
  modules(rootPackage: string[]): Array<{ path: HxTypePath; code: string }> {
    return [...this.packages]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([pkg, members]) => {
        const path = ExternRegistry.path(rootPackage, pkg);
        const fields = [...members.values()].map((line) => `\t${line}`);
        const code = [
          `package ${path.pack.join('.')};`,
          '',
          '#if js',
          `@:jsRequire(${JSON.stringify(pkg)})`,
          `extern class ${path.name} {`,
          ...fields,
          '}',
          '#else',
          `#error ${JSON.stringify(`npm package "${pkg}" is only available on the JS target: ts2hx has no cross-target shim for it`)}`,
          '#end',
          '',
        ].join('\n');
        return { path, code };
      });
  }
}
