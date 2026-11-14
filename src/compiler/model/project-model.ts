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
  MAIN_CLASS,
  moduleName,
  packageSegment,
  RESERVED_ROOT_PACKAGES,
  ROOT_PACKAGE_RULE,
} from './names';

export { MAIN_CLASS };

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
  /**
   * Haxe names of the module's enums and namespaces, by declaration: nested ones are
   * `Outer_Inner`, and a namespace merged with a class takes the class's name.
   */
  types: Map<ts.Node, string>;
  /** Static fields of those enums and namespaces, by member declaration. */
  statics: Map<ts.Node, StaticMember>;
}

/** A static field of a generated class (`owner`, declared in the module) or enum abstract. */
export interface StaticMember {
  owner: string;
  name: string;
}

/** What a value reference resolves to through import and export aliases. */
export type ModuleValue =
  | { kind: 'field'; module: ModuleInfo; name: string; declaration: ts.Node }
  | { kind: 'namespace'; module: ModuleInfo }
  | {
      kind: 'static';
      module: ModuleInfo;
      owner: string;
      name: string;
      declaration: ts.Node;
    };

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

/** The elements of a destructuring pattern that bind a name, nested ones included, in source order. */
export function bindingElements(
  pattern: ts.BindingPattern,
): ts.BindingElement[] {
  return pattern.elements.flatMap((element) =>
    ts.isOmittedExpression(element)
      ? []
      : ts.isIdentifier(element.name)
        ? [element]
        : bindingElements(element.name),
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
        if (!ts.isIdentifier(declaration.name)) {
          for (const element of bindingElements(declaration.name)) {
            result.push([element, (element.name as ts.Identifier).text]);
          }
        } else if (!boundClassExpression(declaration)) {
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
  const taken = new Set([
    ...reserved,
    MODULE_INIT,
    modulePath.module,
    ...declaredTypeNames(sf, modulePath, reserved),
  ]);
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
  reserved: ReadonlySet<string> = new Set(),
): Map<ts.ClassLikeDeclaration, string> {
  const taken = new Set([
    modulePath.module,
    ...fields.values(),
    ...declaredTypeNames(sf, modulePath, reserved),
  ]);
  const names = new Map<ts.ClassLikeDeclaration, string>();
  const visit = (node: ts.Node): void => {
    if (isHoistedClass(node)) {
      const base = className(
        hoistedClassName(node),
        modulePath.module,
        reserved,
      );
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

/** Haxe names of the types a module declares at its top level, enums and namespaces included. */
function declaredTypeNames(
  sf: ts.SourceFile,
  modulePath: HxTypePath,
  reserved: ReadonlySet<string>,
): string[] {
  const names: string[] = [];
  for (const statement of sf.statements) {
    if (
      ts.isInterfaceDeclaration(statement) ||
      ts.isTypeAliasDeclaration(statement) ||
      (ts.isClassDeclaration(statement) && statement.name) ||
      ts.isEnumDeclaration(statement) ||
      (ts.isModuleDeclaration(statement) && ts.isIdentifier(statement.name))
    ) {
      names.push(
        typedefName(statement.name!.text, modulePath.module, reserved),
      );
    }
  }
  return names;
}

/** Whether a declaration is ambient: `declare`d itself or inside a `declare`d namespace. */
export function isAmbient(node: ts.Node): boolean {
  for (let n: ts.Node | undefined = node; n; n = n.parent) {
    if (ts.isSourceFile(n)) return n.isDeclarationFile;
    if (
      ts.canHaveModifiers(n) &&
      ts.getModifiers(n)?.some((m) => m.kind === ts.SyntaxKind.DeclareKeyword)
    ) {
      return true;
    }
  }
  return false;
}

/** The statements of a namespace body; `namespace A.B {}` nests B directly in A. */
export function namespaceStatements(
  declaration: ts.ModuleDeclaration,
): readonly ts.Statement[] {
  const body = declaration.body;
  if (!body) return [];
  return ts.isModuleBlock(body)
    ? body.statements
    : ts.isModuleDeclaration(body)
      ? [body]
      : [];
}

/**
 * Whether a namespace declaration becomes (part of) a Haxe class: a non-ambient,
 * instantiated namespace merged at most with namespaces and one class.
 */
function isConvertedNamespace(
  declaration: ts.ModuleDeclaration,
  symbol: ts.Symbol | undefined,
): symbol is ts.Symbol {
  return (
    !!symbol &&
    ts.isIdentifier(declaration.name) &&
    !isAmbient(declaration) &&
    (symbol.flags & ts.SymbolFlags.ValueModule) !== 0 &&
    (symbol.declarations ?? []).every(
      (d) =>
        (ts.isModuleDeclaration(d) && !isAmbient(d)) ||
        (ts.isClassDeclaration(d) && ts.isSourceFile(d.parent)),
    )
  );
}

/** The name of an enum member as a JS property key. */
export function enumMemberKey(member: ts.EnumMember): string | undefined {
  const name = member.name;
  return ts.isIdentifier(name) ||
    ts.isStringLiteral(name) ||
    ts.isNoSubstitutionTemplateLiteral(name) ||
    ts.isNumericLiteral(name)
    ? name.text
    : undefined;
}

/**
 * Haxe names of a module's enums and namespaces (ADR 0005) and of their static
 * members. Nested namespaces and enums are named `Outer_Inner`; a namespace merged
 * with a class adds its members to the class. Statics never take a `reserved` name.
 */
export function assignTypeNames(
  sf: ts.SourceFile,
  modulePath: HxTypePath,
  checker: ts.TypeChecker,
  reserved: ReadonlySet<string> = new Set(),
): { types: Map<ts.Node, string>; statics: Map<ts.Node, StaticMember> } {
  const types = new Map<ts.Node, string>();
  const statics = new Map<ts.Node, StaticMember>();
  const bySymbol = new Map<ts.Symbol, string>();
  const takenStatics = new Map<string, Set<string>>();
  const addStatic = (owner: string, node: ts.Node, tsName: string): void => {
    let taken = takenStatics.get(owner);
    if (!taken) {
      taken = new Set();
      takenStatics.set(owner, taken);
    }
    let base = escapeIdentifier(tsName);
    if (reserved.has(base)) base = `${base}_`;
    let name = base;
    for (let n = 2; taken.has(name); n++) {
      name = `${base}_${n}`;
    }
    taken.add(name);
    statics.set(node, { owner, name });
  };
  const typeName = (symbol: ts.Symbol, tsName: string, outer?: string) => {
    let name = bySymbol.get(symbol);
    if (name === undefined) {
      name = typedefName(
        outer === undefined ? tsName : `${outer}_${tsName}`,
        modulePath.module,
        reserved,
      );
      bySymbol.set(symbol, name);
    }
    return name;
  };
  const visitStatements = (
    statements: readonly ts.Statement[],
    outer?: string,
  ): void => {
    for (const statement of statements) {
      if (ts.isEnumDeclaration(statement) && !isAmbient(statement)) {
        const symbol = checker.getSymbolAtLocation(statement.name);
        if (
          !symbol ||
          !(symbol.declarations ?? []).every(ts.isEnumDeclaration)
        ) {
          continue;
        }
        const name = typeName(symbol, statement.name.text, outer);
        types.set(statement, name);
        for (const member of statement.members) {
          const key = enumMemberKey(member);
          if (key !== undefined) addStatic(name, member, key);
        }
      } else if (ts.isModuleDeclaration(statement)) {
        const symbol = checker.getSymbolAtLocation(statement.name);
        if (!isConvertedNamespace(statement, symbol)) continue;
        const merged = symbol.declarations?.find(ts.isClassDeclaration);
        const name = merged?.name
          ? className(merged.name.text, modulePath.module, reserved)
          : typeName(symbol, (statement.name as ts.Identifier).text, outer);
        types.set(statement, name);
        for (const member of namespaceStatements(statement)) {
          if (ts.isVariableStatement(member)) {
            for (const declaration of member.declarationList.declarations) {
              const elements = ts.isIdentifier(declaration.name)
                ? boundClassExpression(declaration)
                  ? []
                  : [declaration]
                : bindingElements(declaration.name);
              for (const element of elements) {
                addStatic(name, element, (element.name as ts.Identifier).text);
              }
            }
          } else if (
            ts.isFunctionDeclaration(member) &&
            member.body &&
            member.name
          ) {
            addStatic(name, member, member.name.text);
          }
        }
        visitStatements(namespaceStatements(statement), name);
      }
    }
  };
  visitStatements(sf.statements);
  return { types, statics };
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
      hoistedClasses: assignHoistedClassNames(
        sourceFile,
        modulePath,
        fields,
        reservedLocalNames,
      ),
      ...assignTypeNames(sourceFile, modulePath, checker, reservedLocalNames),
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
      const member = module?.statics.get(declaration);
      if (module && member) {
        return { kind: 'static', module, ...member, declaration };
      }
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
