import * as path from 'node:path';
import ts from 'typescript';

import type { HxTypePath } from '../ir/types';
import {
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
}

export interface ProjectModel {
  program: ts.Program;
  checker: ts.TypeChecker;
  rootPackage: string[];
  modules: ModuleInfo[];
  /** Entry module, when the project has one. */
  entry?: ModuleInfo;
  /** Modules in Node's ESM evaluation order (post-order DFS over imports from the entry). */
  initOrder: ModuleInfo[];
  moduleOf(sourceFile: ts.SourceFile): ModuleInfo | undefined;
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

function importedFiles(
  sf: ts.SourceFile,
  checker: ts.TypeChecker,
): ts.SourceFile[] {
  const result: ts.SourceFile[] = [];
  for (const stmt of sf.statements) {
    let specifier: ts.Expression | undefined;
    if (ts.isImportDeclaration(stmt) && !stmt.importClause?.isTypeOnly) {
      specifier = stmt.moduleSpecifier;
    } else if (ts.isExportDeclaration(stmt) && !stmt.isTypeOnly) {
      specifier = stmt.moduleSpecifier;
    }
    const decl = specifier
      ? checker.getSymbolAtLocation(specifier)?.valueDeclaration
      : undefined;
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
  const modules = files.map((sourceFile) => ({
    sourceFile,
    path: paths.get(sourceFile)!,
  }));
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
    importedFiles(sf, checker).forEach(visit);
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
    moduleOf: (sf) => bySourceFile.get(sf),
  };
}
