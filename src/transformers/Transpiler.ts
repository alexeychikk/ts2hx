import type ts from 'typescript';
import { mapValues } from 'lodash';
import { logger } from '../Logger';
import * as utils from './utils';

type Utils = typeof utils;
type TransformerUtils = {
  [key in keyof Utils]: OmitThisParameter<Utils[key]>;
};

export interface VisitNodeContext {
  enforceParameterType?: boolean;
  skipParameterInitializer?: boolean;
  variableDeclaration?: {
    variableDeclarationIndent?: string;
    variableDeclarationKeyword?: string;
    variableDeclarationInitializer?: string;
  };
}

export type TransformerFn = (
  this: Transpiler,
  node: ts.Node,
  context: VisitNodeContext,
) => string | undefined;

export class Transpiler {
  ignoreErrors?: boolean;
  includeComments?: boolean;
  includeTodos?: boolean;
  typeChecker: ts.TypeChecker;
  compilerOptions: ts.CompilerOptions;
  sourceFile: ts.SourceFile;
  transformers: TransformerFn[];
  haxeCode?: string;

  protected nodesToIgnore = new Set<ts.Node>();
  protected nodesToReplaceFullText = new Set<ts.Node>();
  protected symbolsToRename: Record<string, Map<ts.Symbol, string>> = {};
  protected anonymousClassCounter = 0;
  protected imports: {
    eitherType?: boolean;
    dynamicAccess?: boolean;
    exception?: boolean;
  } = {};

  utils = mapValues(utils, (fn) => fn.bind(this)) as TransformerUtils;

  constructor(options: {
    typeChecker: ts.TypeChecker;
    compilerOptions: ts.CompilerOptions;
    sourceFile: ts.SourceFile;
    transformers: TransformerFn[];
    ignoreErrors?: boolean;
    includeComments?: boolean;
    includeTodos?: boolean;
  }) {
    this.typeChecker = options.typeChecker;
    this.compilerOptions = options.compilerOptions;
    this.sourceFile = options.sourceFile;
    this.transformers = options.transformers;
    this.ignoreErrors = options.ignoreErrors;
    this.includeComments = options.includeComments;
    this.includeTodos = options.includeTodos;
  }

  runTsTransformers(): void {
    // TODO
  }

  emit(): string {
    let haxeCode = this.visitNode(this.sourceFile, {});

    const imports = [
      this.imports.exception && `import haxe.Exception;`,
      this.imports.dynamicAccess && `import haxe.DynamicAccess;`,
      this.imports.eitherType && `import haxe.extern.EitherType;`,
    ].filter(Boolean);
    haxeCode = `${
      imports.join('\n') + (imports.length ? '\n\n' : '')
    }${haxeCode}`;

    const packageName = this.utils.getPackageName();
    haxeCode = `${packageName ? `package ${packageName};\n\n` : ''}${haxeCode}`;

    this.haxeCode = haxeCode;
    return haxeCode;
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
      try {
        const result = fn.call(this, node, context);
        if (result != null) return result;
      } catch (error) {
        if (!this.ignoreErrors) throw error;
        logger.error(error);
        return (
          this.utils.createComment(({ todo }) => `${todo} INTERNAL_ERROR`) +
          node.getFullText()
        );
      }
    }
  }

  protected dump(node: ts.Node, code: string): string {
    return node.pos === -1 || this.nodesToReplaceFullText.has(node)
      ? code
      : node.getFullText().replace(node.getText(), code);
  }

  protected traverseChildren(node: ts.Node, context: VisitNodeContext): string {
    if (node.pos === -1) return '';

    const nodeFullCode = node
      .getChildren()
      .map((node) => this.visitNode(node, context))
      .join('');

    return nodeFullCode || node.getFullText();
  }

  protected replaceNodeFullText(node: ts.Node): void {
    this.nodesToReplaceFullText.add(node);
  }

  protected ignoreNode(node: ts.Node): void {
    this.nodesToIgnore.add(node);
  }
}
