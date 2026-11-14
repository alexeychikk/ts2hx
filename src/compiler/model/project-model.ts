import * as path from 'node:path';
import ts from 'typescript';

import type { HxTypePath } from '../ir/types';
import { MODULE_INIT } from '../printer/printer';
import { className, typedefName } from '../frontend/types';
import {
  boundClassExpression,
  hoistedClassName,
  isHoistedClass,
} from '../frontend/classes';
import {
  escapeIdentifier,
  isValidRootPackage,
  moduleName,
  packageSegment,
  RESERVED_ROOT_PACKAGES,
  ROOT_PACKAGE_RULE,
} from './names';

/** Name of the generated entry class in the root package. */
export const MAIN_CLASS = 'Main';

export interface ModuleInfo {
  sourceFile: ts.SourceFile;
  /** Haxe path of the module; `name === module` (module-level fields only so far). */
  path: HxTypePath;
  /**
   * Haxe names of the module-level values, by declaration: variables, functions and
   * the `default` export of an expression (`export default 1 + 1`).
   */
  fields: Map<ts.Node, string>;
  /** Haxe names of the class expressions and local classes the module declares at its top level. */
  hoistedClasses: Map<ts.ClassLikeDeclaration, string>;
}

/** What a value reference resolves to through import and export aliases. */
export type ModuleValue =
  | { kind: 'field'; module: ModuleInfo; name: string; declaration: ts.Node }
  | { kind: 'namespace'; module: ModuleInfo };

export interface ProjectModel {
  program: ts.Program;
  checker: ts.TypeChecker;
  rootPackage: string[];
  modules: ModuleInfo[];
  /** Entry module, when the project has one. */
  entry?: ModuleInfo;
  /** Modules in Node's ESM evaluation order (post-order DFS over imports from the entry). */
  initOrder: ModuleInfo[];
  /**
   * First segments of the paths generated code names (`ts2hx`, `haxe`, project root
   * packages, modules of the empty package): locals must not shadow them.
   */
  reservedLocalNames: ReadonlySet<string>;
  moduleOf(sourceFile: ts.SourceFile): ModuleInfo | undefined;
  /**
   * The project module-level value or module namespace a symbol denotes, following
   * import/export aliases (`import {a as b}`, default, `import * as`, re-exports).
   */
  resolveValue(symbol: ts.Symbol): ModuleValue | undefined;
}

export interface ProjectModelOptions {
  entry?: string;
  rootPackage?: string;
}

/** Project sources: everything the program compiles except declaration files and dependencies. */
export function projectSourceFiles(program: ts.Program): ts.SourceFile[] {
  return program
    .getSourceFiles()
    .filter(
      (sf) =>
        !sf.isDeclarationFile &&
        !program.isSourceFileFromExternalLibrary(sf) &&
        !sf.fileName.split(/[\\/]/).includes('node_modules'),
    );
}

function commonDirectory(files: string[]): string {
  if (files.length === 0) {
    return '';
  }
  let common = path.dirname(files[0]).split('/');
  for (const file of files.slice(1)) {
    const parts = path.dirname(file).split('/');
    let i = 0;
    while (i < common.length && i < parts.length && common[i] === parts[i]) {
      i++;
    }
    common = common.slice(0, i);
  }
  return common.join('/');
}

function baseName(fileName: string): string {
  return path.basename(fileName).replace(/\.(d\.)?[mc]?tsx?$/, '');
}

function assignPaths(
  files: ts.SourceFile[],
  rootPackage: string[],
): Map<ts.SourceFile, HxTypePath> {
  const root = commonDirectory(files.map((f) => f.fileName));
  const taken = new Set([[...rootPackage, MAIN_CLASS].join('.').toLowerCase()]);
  const paths = new Map<ts.SourceFile, HxTypePath>();
  const sorted = [...files].sort((a, b) =>
    a.fileName < b.fileName ? -1 : a.fileName > b.fileName ? 1 : 0,
  );
  for (const sf of sorted) {
    const relativeDir = path.posix.relative(root, path.dirname(sf.fileName));
    const dirs = relativeDir ? relativeDir.split('/').map(packageSegment) : [];
    if (
      rootPackage.length === 0 &&
      dirs.length > 0 &&
      RESERVED_ROOT_PACKAGES.has(dirs[0])
    ) {
      dirs[0] = `${dirs[0]}_`;
    }
    const pack = [...rootPackage, ...dirs];
    const base = moduleName(baseName(sf.fileName));
    let name = base;
    for (let n = 2; taken.has([...pack, name].join('.').toLowerCase()); n++) {
      name = `${base}_${n}`;
    }
    taken.add([...pack, name].join('.').toLowerCase());
    paths.set(sf, { pack, module: name, name });
  }
  return paths;
}

/**
 * Whether `export default <expression>` aliases a binding rather than snapshotting a
 * value: ESM evaluates the expression once, so only bindings that never change alias.
 */
function exportsImmutableBinding(
  expression: ts.Expression,
  checker: ts.TypeChecker,
): boolean {
  if (!ts.isIdentifier(expression)) {
    return false;
  }
  const symbol = checker.getSymbolAtLocation(expression);
  const declaration = symbol && resolveAlias(symbol, checker).valueDeclaration;
  return (
    !!declaration &&
    !(
      ts.isVariableDeclaration(declaration) &&
      !(ts.getCombinedNodeFlags(declaration) & ts.NodeFlags.Const)
    )
  );
}

/** Module-level value declarations of a file with their TS names, in source order. */
function fieldDeclarations(
  sf: ts.SourceFile,
  checker: ts.TypeChecker,
): Array<[ts.Node, string]> {
  const result: Array<[ts.Node, string]> = [];
  for (const statement of sf.statements) {
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (
          ts.isIdentifier(declaration.name) &&
          !boundClassExpression(declaration)
        ) {
          result.push([declaration, declaration.name.text]);
        }
      }
    } else if (ts.isFunctionDeclaration(statement) && statement.body) {
      result.push([statement, statement.name?.text ?? 'default']);
    } else if (
      ts.isExportAssignment(statement) &&
      !statement.isExportEquals &&
      !exportsImmutableBinding(statement.expression, checker)
    ) {
      result.push([statement, 'default']);
    }
  }
  return result;
}

/**
 * Haxe names of a module's values: escaped identifiers, renamed `name_2`, … when they
 * collide with each other, the module, its typedefs and classes, its `__init` or a
 * `reserved` name.
 */
export function assignFieldNames(
  sf: ts.SourceFile,
  modulePath: HxTypePath,
  checker: ts.TypeChecker,
  reserved: ReadonlySet<string> = new Set(),
): Map<ts.Node, string> {
  const taken = new Set([...reserved, MODULE_INIT, modulePath.module]);
  for (const statement of sf.statements) {
    if (
      ts.isInterfaceDeclaration(statement) ||
      ts.isTypeAliasDeclaration(statement)
    ) {
      taken.add(typedefName(statement.name.text, modulePath.module));
    } else if (ts.isClassDeclaration(statement) && statement.name) {
      taken.add(className(statement.name.text, modulePath.module));
    }
  }
  const names = new Map<ts.Node, string>();
  for (const [declaration, tsName] of fieldDeclarations(sf, checker)) {
    const base = escapeIdentifier(tsName);
    let name = base;
    for (let n = 2; taken.has(name); n++) {
      name = `${base}_${n}`;
    }
    taken.add(name);
    names.set(declaration, name);
  }
  return names;
}

/**
 * Haxe names of a module's hoisted classes (class expressions and local classes, ADR
 * 0005), in source order: named like a class, after the class or its `const`, and
 * renamed `Name_2`, … when they collide with the module's other names.
 */
export function assignHoistedClassNames(
  sf: ts.SourceFile,
  modulePath: HxTypePath,
  fields: ReadonlyMap<ts.Node, string>,
): Map<ts.ClassLikeDeclaration, string> {
  const taken = new Set([modulePath.module, ...fields.values()]);
  for (const statement of sf.statements) {
    if (
      ts.isInterfaceDeclaration(statement) ||
      ts.isTypeAliasDeclaration(statement)
    ) {
      taken.add(typedefName(statement.name.text, modulePath.module));
    } else if (ts.isClassDeclaration(statement) && statement.name) {
      taken.add(className(statement.name.text, modulePath.module));
    }
  }
  const names = new Map<ts.ClassLikeDeclaration, string>();
  const visit = (node: ts.Node): void => {
    if (isHoistedClass(node)) {
      const base = className(hoistedClassName(node), modulePath.module);
      let name = base;
      for (let n = 2; taken.has(name); n++) {
        name = `${base}_${n}`;
      }
      taken.add(name);
      names.set(node, name);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return names;
}

const VALUE_FLAGS = ts.SymbolFlags.Value & ~ts.SymbolFlags.ConstEnum;

function resolveAlias(symbol: ts.Symbol, checker: ts.TypeChecker): ts.Symbol {
  return symbol.flags & ts.SymbolFlags.Alias
    ? checker.getAliasedSymbol(symbol)
    : symbol;
}

function isValueSymbol(
  symbol: ts.Symbol | undefined,
  checker: ts.TypeChecker,
): boolean {
  return !!symbol && (resolveAlias(symbol, checker).flags & VALUE_FLAGS) !== 0;
}

function isTypeOnlyPosition(node: ts.Node): boolean {
  if (ts.isExpressionWithTypeArguments(node)) {
    const clause = node.parent;
    return !(
      ts.isHeritageClause(clause) &&
      clause.token === ts.SyntaxKind.ExtendsKeyword &&
      ts.isClassLike(clause.parent)
    );
  }
  return (
    ts.isTypeNode(node) ||
    ts.isInterfaceDeclaration(node) ||
    ts.isTypeAliasDeclaration(node) ||
    ts.isImportDeclaration(node) ||
    ts.isImportEqualsDeclaration(node)
  );
}

/** Symbols a file reads as values: what decides whether TS keeps an import (elision). */
function valueReferences(
  sf: ts.SourceFile,
  checker: ts.TypeChecker,
): Set<ts.Symbol> {
  const symbols = new Set<ts.Symbol>();
  const visit = (node: ts.Node): void => {
    if (isTypeOnlyPosition(node)) {
      return;
    }
    if (ts.isExportSpecifier(node)) {
      if (!node.parent.parent.moduleSpecifier && !node.isTypeOnly) {
        const local = checker.getExportSpecifierLocalTargetSymbol(node);
        if (local) symbols.add(local);
      }
      return;
    }
    if (ts.isIdentifier(node)) {
      const symbol =
        ts.isShorthandPropertyAssignment(node.parent) &&
        node.parent.name === node
          ? checker.getShorthandAssignmentValueSymbol(node.parent)
          : checker.getSymbolAtLocation(node);
      if (symbol) symbols.add(symbol);
      return;
    }
    ts.forEachChild(node, visit);
  };
  sf.statements.forEach(visit);
  return symbols;
}

function importBindings(clause: ts.ImportClause): ts.Identifier[] {
  const names: ts.Identifier[] = clause.name ? [clause.name] : [];
  const bindings = clause.namedBindings;
  if (bindings && ts.isNamespaceImport(bindings)) {
    names.push(bindings.name);
  } else if (bindings) {
    names.push(
      ...bindings.elements.filter((e) => !e.isTypeOnly).map((e) => e.name),
    );
  }
  return names;
}

/**
 * Modules a file evaluates, in source order. Like TS's emit, it drops `import type` and
 * `export type … from`; unless `verbatimModuleSyntax` is on, also an import none of
 * whose bindings is read as a value, and a re-export of types only.
 */
export function evaluatedImports(
  sf: ts.SourceFile,
  checker: ts.TypeChecker,
  options: ts.CompilerOptions = {},
): ts.SourceFile[] {
  const verbatim = !!options.verbatimModuleSyntax;
  let references: Set<ts.Symbol> | undefined;
  const isReferenced = (name: ts.Identifier): boolean => {
    references ??= valueReferences(sf, checker);
    const symbol = checker.getSymbolAtLocation(name);
    return !!symbol && references.has(symbol) && isValueSymbol(symbol, checker);
  };
  const moduleSymbol = (specifier: ts.Expression) =>
    checker.getSymbolAtLocation(specifier);
  const result: ts.SourceFile[] = [];
  for (const stmt of sf.statements) {
    let specifier: ts.Expression | undefined;
    if (ts.isImportDeclaration(stmt)) {
      const clause = stmt.importClause;
      if (
        !clause ||
        (!clause.isTypeOnly &&
          (verbatim || importBindings(clause).some(isReferenced)))
      ) {
        specifier = stmt.moduleSpecifier;
      }
    } else if (
      ts.isExportDeclaration(stmt) &&
      stmt.moduleSpecifier &&
      !stmt.isTypeOnly
    ) {
      const clause = stmt.exportClause;
      const target = moduleSymbol(stmt.moduleSpecifier);
      const kept =
        verbatim ||
        (!clause
          ? !!target &&
            checker
              .getExportsOfModule(target)
              .some((s) => isValueSymbol(s, checker))
          : ts.isNamespaceExport(clause) ||
            clause.elements.some(
              (e) =>
                !e.isTypeOnly &&
                isValueSymbol(
                  checker.getExportSpecifierLocalTargetSymbol(e),
                  checker,
                ),
            ));
      if (kept) {
        specifier = stmt.moduleSpecifier;
      }
    }
    const decl = specifier && moduleSymbol(specifier)?.valueDeclaration;
    if (decl && ts.isSourceFile(decl)) {
      result.push(decl);
    }
  }
  return result;
}

export function buildProjectModel(
  program: ts.Program,
  options: ProjectModelOptions = {},
): ProjectModel {
  if (options.rootPackage && !isValidRootPackage(options.rootPackage)) {
    throw new Error(
      `Invalid root package "${options.rootPackage}": ${ROOT_PACKAGE_RULE}`,
    );
  }
  const checker = program.getTypeChecker();
  const rootPackage = options.rootPackage
    ? options.rootPackage.split('.').filter(Boolean)
    : [];
  const files = projectSourceFiles(program);
  const paths = assignPaths(files, rootPackage);
  const reservedLocalNames = new Set(['haxe', 'ts2hx']);
  for (const { pack, module } of paths.values()) {
    reservedLocalNames.add(pack.length > 0 ? pack[0] : module);
  }
  const modules = files.map((sourceFile): ModuleInfo => {
    const modulePath = paths.get(sourceFile)!;
    const fields = assignFieldNames(
      sourceFile,
      modulePath,
      checker,
      reservedLocalNames,
    );
    return {
      sourceFile,
      path: modulePath,
      fields,
      hoistedClasses: assignHoistedClassNames(sourceFile, modulePath, fields),
    };
  });
  const bySourceFile = new Map(modules.map((m) => [m.sourceFile, m]));

  let entry: ModuleInfo | undefined;
  if (options.entry) {
    const entryFile = program.getSourceFile(path.resolve(options.entry));
    entry = entryFile && bySourceFile.get(entryFile);
    if (!entry) {
      throw new Error(
        `Entry ${options.entry} is not a source file of the program`,
      );
    }
  }

  const initOrder: ModuleInfo[] = [];
  const visited = new Set<ts.SourceFile>();
  const visit = (sf: ts.SourceFile): void => {
    const info = bySourceFile.get(sf);
    if (!info || visited.has(sf)) {
      return;
    }
    visited.add(sf);
    evaluatedImports(sf, checker, program.getCompilerOptions()).forEach(visit);
    initOrder.push(info);
  };
  if (entry) {
    visit(entry.sourceFile);
  }

  return {
    program,
    checker,
    rootPackage,
    modules,
    entry,
    initOrder,
    reservedLocalNames,
    moduleOf: (sf) => bySourceFile.get(sf),
    resolveValue: (symbol) => resolveValue(symbol, checker, bySourceFile),
  };
}

function resolveValue(
  start: ts.Symbol,
  checker: ts.TypeChecker,
  bySourceFile: Map<ts.SourceFile, ModuleInfo>,
): ModuleValue | undefined {
  for (let symbol: ts.Symbol | undefined = start; symbol;) {
    for (const declaration of symbol.declarations ?? []) {
      if (ts.isSourceFile(declaration)) {
        const module = bySourceFile.get(declaration);
        return module && { kind: 'namespace', module };
      }
      const module = bySourceFile.get(declaration.getSourceFile());
      const name = module?.fields.get(declaration);
      if (module && name !== undefined) {
        return { kind: 'field', module, name, declaration };
      }
    }
    symbol =
      symbol.flags & ts.SymbolFlags.Alias
        ? checker.getImmediateAliasedSymbol(symbol)
        : undefined;
  }
  return undefined;
}
