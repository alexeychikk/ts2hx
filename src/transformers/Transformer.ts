import path from 'path';
import type ts from 'typescript';
import { mapValues } from 'lodash';
import { logger } from '../Logger';
import * as utils from './utils';

type Utils = typeof utils;
type TransformerUtils = {
  [key in keyof Utils]: OmitThisParameter<Utils[key]>;
};

export interface VisitNodeContext {
  skipParameterInitializer?: boolean;
  enforceParameterType?: boolean;
}

export type TransformerFn = (
  this: Transformer,
  node: ts.Node,
  context: VisitNodeContext,
) => string | undefined;

export class Transformer {
  includeComments?: boolean;
  includeTodos?: boolean;
  typeChecker: ts.TypeChecker;
  compilerOptions: ts.CompilerOptions;
  sourceFile: ts.SourceFile;
  transformers: TransformerFn[];

  protected nodesToIgnore = new Set<ts.Node>();
  protected nodesToReplaceFullText = new Set<ts.Node>();
  protected anonymousClassCounter = 0;
  protected imports: {
    eitherType?: boolean;
    dynamicAccess?: boolean;
    exception?: boolean;
  } = {};

  protected utils = mapValues(utils, (fn) => fn.bind(this)) as TransformerUtils;

  constructor(options: {
    typeChecker: ts.TypeChecker;
    compilerOptions: ts.CompilerOptions;
    sourceFile: ts.SourceFile;
    transformers: TransformerFn[];
    includeComments?: boolean;
    includeTodos?: boolean;
  }) {
    this.includeComments = options.includeComments;
    this.includeTodos = options.includeTodos;
    this.typeChecker = options.typeChecker;
    this.compilerOptions = options.compilerOptions;
    this.sourceFile = options.sourceFile;
    this.transformers = options.transformers;
  }

  run(): string {
    logger.log('Transforming', this.sourceFile.fileName);
    let haxeCode = this.visitNode(this.sourceFile, {});

    const imports = [
      this.imports.exception && `import haxe.Exception;`,
      this.imports.dynamicAccess && `import haxe.DynamicAccess;`,
      this.imports.eitherType && `import haxe.extern.EitherType;`,
    ].filter(Boolean);
    haxeCode = `${
      imports.join('\n') + (imports.length ? '\n\n' : '')
    }${haxeCode}`;

    const packageName = this.getPackageName();
    haxeCode = `${packageName ? `package ${packageName};\n\n` : ''}${haxeCode}`;

    return haxeCode;
  }

  getPackageName(filePath = this.getRelativeFilePath()): string {
    const dirPath = path.dirname(filePath);
    if (dirPath === '.') return '';
    return dirPath.replace(/[\\/]/g, '.');
  }

  getModuleFilePath(fileName = this.sourceFile.fileName): string {
    const filePath = this.getRelativeFilePath(fileName);
    const fileExt = path.extname(filePath);
    return filePath.slice(0, -fileExt.length);
  }

  getRelativeFilePath(fileName = this.sourceFile.fileName): string {
    return path.relative(this.compilerOptions.rootDir!, fileName);
  }

  getImportedPackageName(fileName: string): string {
    const modulePath = this.getModuleFilePath(fileName);
    const relativeFileName =
      path.basename(modulePath) === 'index'
        ? modulePath
        : path.join(modulePath, './index.ts');
    return this.getPackageName(relativeFileName);
  }

  protected visitNode(
    node: ts.Node | undefined,
    context: VisitNodeContext,
  ): string {
    if (!node || this.nodesToIgnore.has(node)) {
      return ' ';
    }

    const transformedCode = this.transformNode(node, context);
    if (transformedCode != null) {
      return this.dump(node, transformedCode);
    }

    return this.traverseChildren(node, context);
  }

  protected transformNode(
    node: ts.Node,
    context: VisitNodeContext,
  ): string | undefined {
    for (const fn of this.transformers) {
      const result = fn.call(this, node, context);
      if (result != null) return result;
    }
  }

  protected dump(node: ts.Node, code: string): string {
    return node.pos === -1 || this.nodesToReplaceFullText.has(node)
      ? code
      : node.getFullText().replace(node.getText(), code);
  }

  protected traverseChildren(node: ts.Node, context: VisitNodeContext): string {
    const nodeFullCode = node
      .getChildren()
      .map((node) => this.visitNode(node, context))
      .join('');

    return (
      nodeFullCode || (node.pos === -1 ? nodeFullCode : node.getFullText())
    );
  }

  protected replaceNodeFullText(node: ts.Node): void {
    this.nodesToReplaceFullText.add(node);
  }

  protected ignoreNode(node: ts.Node): void {
    this.nodesToIgnore.add(node);
  }
}
