import ts from 'typescript';
import { mapValues } from 'lodash';
import { logger } from '../Logger';
import * as utils from './utils';

export class Transpiler {
  program: ts.Program;
  sourceFile: ts.SourceFile;
  transformers: TransformerFn[];
  emitters: EmitFn[];
  flags: TranspilerFlags;
  haxeCode?: string;

  protected nodesToIgnore = new Set<ts.Node>();
  protected nodesToReplaceFullText = new Set<ts.Node>();
  protected symbolsToRename: Record<string, Map<ts.Symbol, string>> = {};
  protected anonymousClassCounter = 0;
  protected imports: {
    eitherType?: boolean;
    exception?: boolean;
  } = {};
  nodeMetadata = new Map<ts.Node, string[]>();

  utils = mapValues(utils, (fn) => fn.bind(this)) as TransformerUtils;

  constructor(options: {
    program: ts.Program;
    sourceFile: ts.SourceFile;
    transformers: TransformerFn[];
    emitters: EmitFn[];
    flags?: TranspilerFlags;
  }) {
    this.program = options.program;
    this.sourceFile = options.sourceFile;
    this.transformers = options.transformers;
    this.emitters = options.emitters;
    this.flags = options.flags ?? {};
  }

  get typeChecker(): ts.TypeChecker {
    return this.program.getTypeChecker();
  }

  get compilerOptions(): ts.CompilerOptions {
    return this.program.getCompilerOptions();
  }

  transform(): void {
    const transformers: Array<ts.TransformerFactory<ts.SourceFile>> =
      this.transformers.map((trans) => {
        return (context) => {
          const visitor = (
            node: ts.Node,
            parentNode: ts.Node,
          ): ts.Node | undefined => {
            let result: ts.Node;

            try {
              result = trans.call(this, node, context, parentNode) ?? node;
            } catch (error) {
              if (!this.flags.ignoreErrors) throw error;
              logger.error(error);
              result = node;
            }

            return ts.visitEachChild(
              result,
              (childNode) => visitor(childNode, result),
              context,
            );
          };
          return (node) =>
            ts.visitNode(node, (n) => visitor(n, node)) as ts.SourceFile;
        };
      });

    const { transformed } = ts.transform(this.sourceFile, transformers);
    this.sourceFile = transformed[0];
  }

  emit(): string {
    let haxeCode = this.emitNode(this.sourceFile, {});

    const imports = [
      this.imports.exception && `import haxe.Exception;`,
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

  protected applyEmitters(
    node: ts.Node,
    context: VisitNodeContext,
  ): string | undefined {
    for (const fn of this.emitters) {
      try {
        const result = fn.call(this, node, context);
        if (result != null) return result;
      } catch (error) {
        if (!this.flags.ignoreErrors) throw error;
        logger.error(error);
        return (
          this.utils.createComment(({ todo }) => `${todo} INTERNAL_ERROR`) +
          node.getFullText()
        );
      }
    }
  }

  protected dump(node: ts.Node, code: string): string {
    if (node.pos === -1 || this.nodesToReplaceFullText.has(node)) {
      // Apply metadata even to nodes with pos === -1
      return this.applyNodeMetadata(node, code);
    }

    const fullText = this.sourceFile.getFullText();
    const leadingCode = fullText.slice(node.pos, node.getStart());
    return leadingCode + this.applyNodeMetadata(node, code);
  }
  
  protected applyNodeMetadata(node: ts.Node, code: string): string {
    const metadata = this.nodeMetadata.get(node);
    if (!metadata || metadata.length === 0) {
      return code;
    }
    
    // Add all metadata tags before the code
    // Format: @:metadata1 @:metadata2 code
    
    // Handle function declarations and expressions
    if (ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node) || 
        ts.isFunctionExpression(node) || ts.isArrowFunction(node)) {
      
      // For functions, place metadata before "function" keyword or at the start
      if (code.trim().startsWith('function')) {
        // Insert metadata before the function keyword
        return code.replace(/function/, `${metadata.join(' ')} function`);
      } else if (ts.isArrowFunction(node)) {
        // For arrow functions, add metadata at the start
        return `${metadata.join(' ')} ${code}`;
      }
    }
    
    // For regular await expressions
    return `${metadata.join(' ')} ${code}`;
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
export type TransformerUtils = {
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
  parentNode: ts.Node,
) => ts.Node | undefined;

export type EmitFn = (
  this: Transpiler,
  node: ts.Node,
  context: VisitNodeContext,
) => string | undefined;

export interface TranspilerFlags {
  ignoreErrors?: boolean;
  includeComments?: boolean;
  includeTodos?: boolean;
  transformAsyncAwait?: boolean;
  /** @see https://github.com/HaxeFoundation/haxe/issues/11467 */
  transformTemplateExpression?: boolean;
}
