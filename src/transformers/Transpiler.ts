import ts from 'typescript';
import { mapValues } from 'lodash';
import { logger } from '../Logger';
import * as utils from './utils';

export class Transpiler {
  ignoreErrors?: boolean;
  includeComments?: boolean;
  includeTodos?: boolean;
  program: ts.Program;
  sourceFile: ts.SourceFile;
  transformers: TransformerFn[];
  emitters: EmitFn[];
  haxeCode?: string;

  protected transformationContext?: ts.TransformationContext;
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
    program: ts.Program;
    sourceFile: ts.SourceFile;
    transformers: TransformerFn[];
    emitters: EmitFn[];
    ignoreErrors?: boolean;
    includeComments?: boolean;
    includeTodos?: boolean;
  }) {
    this.program = options.program;
    this.sourceFile = options.sourceFile;
    this.transformers = options.transformers;
    this.emitters = options.emitters;
    this.ignoreErrors = options.ignoreErrors;
    this.includeComments = options.includeComments;
    this.includeTodos = options.includeTodos;
  }

  get typeChecker(): ts.TypeChecker {
    return this.program.getTypeChecker();
  }

  get compilerOptions(): ts.CompilerOptions {
    return this.program.getCompilerOptions();
  }

  transform(): void {
    const transformer: ts.TransformerFactory<ts.SourceFile> = (context) => {
      this.transformationContext = context;
      return this.visitNode as () => ts.SourceFile;
    };

    const { transformed } = ts.transform(this.sourceFile, [transformer]);
    this.sourceFile = transformed[0];
  }

  emit(): string {
    let haxeCode = this.emitNode(this.sourceFile, {});

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

  protected visitNode = <T extends ts.Node | undefined = ts.Node, Ret = T>(
    node: T,
  ): Ret => {
    if (!node) return undefined as Ret;
    return ts.visitNode(node, this.nodeVisitor) as Ret;
  };

  protected visitNodes = <
    T extends ts.Node = ts.Node,
    TArr extends ts.NodeArray<T> | undefined = ts.NodeArray<T>,
    Ret = TArr,
  >(
    nodes: TArr,
  ): Ret => {
    if (!nodes) return undefined as Ret;
    return ts.visitNodes(nodes, this.nodeVisitor) as Ret;
  };

  protected nodeVisitor = (node: ts.Node): ts.Node => {
    const result = this.applyTransformers(node, this.transformationContext!);
    return (
      result ??
      ts.visitEachChild(node, this.nodeVisitor, this.transformationContext!)
    );
  };

  protected emitNode(
    node: ts.Node | undefined,
    context: VisitNodeContext,
  ): string {
    if (!node || this.nodesToIgnore.has(node)) {
      return ' ';
    }

    const transformedCode = this.applyEmitters(node, context);
    if (transformedCode != null) {
      return this.dump(node, transformedCode);
    }

    return this.traverseChildren(node, context);
  }

  protected applyTransformers(
    node: ts.Node,
    context: ts.TransformationContext,
  ): ts.Node | undefined {
    for (const fn of this.transformers) {
      try {
        const result = fn.call(this, node, context);
        if (result != null) return result;
      } catch (error) {
        if (!this.ignoreErrors) throw error;
        logger.error(error);
      }
    }
  }

  protected applyEmitters(
    node: ts.Node,
    context: VisitNodeContext,
  ): string | undefined {
    for (const fn of this.emitters) {
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
      .map((node) => this.emitNode(node, context))
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
  context: ts.TransformationContext,
) => ts.Node | undefined;

export type EmitFn = (
  this: Transpiler,
  node: ts.Node,
  context: VisitNodeContext,
) => string | undefined;
