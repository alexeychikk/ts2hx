import path from 'path';
import ts, { SyntaxKind } from 'typescript';
import { TsUtils } from '../TsUtils';

/**
 * I intended to store indentation level here
 * but seems like this is redundant now
 */
// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface VisitNodeContext {}

export interface SourceFileContext {
  importEitherType?: boolean;
  importDynamicAccess?: boolean;
  importTs2hx?: boolean;
  nodesToIgnore: Set<ts.Node>;
  nodesToFullyReplace: Set<ts.Node>;
}

export type TransformerFn = (
  this: Transformer,
  node: ts.Node,
  context: VisitNodeContext,
) => string | undefined;

export class Transformer {
  typeChecker: ts.TypeChecker;
  compilerOptions: ts.CompilerOptions;
  sourceFile: ts.SourceFile;
  context: SourceFileContext;
  transformers: TransformerFn[];

  constructor(options: {
    typeChecker: ts.TypeChecker;
    compilerOptions: ts.CompilerOptions;
    sourceFile: ts.SourceFile;
    transformers: TransformerFn[];
  }) {
    this.typeChecker = options.typeChecker;
    this.compilerOptions = options.compilerOptions;
    this.sourceFile = options.sourceFile;
    this.transformers = options.transformers;
    this.context = { nodesToIgnore: new Set(), nodesToFullyReplace: new Set() };
  }

  run(): string {
    let haxeCode = this.visitNode(this.sourceFile, {});

    const imports = [
      this.context.importEitherType && `import haxe.extern.EitherType;`,
      this.context.importDynamicAccess && `import haxe.DynamicAccess;`,
      this.context.importTs2hx && `import ts2hx.Ts2hx;`,
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
    if (!node || this.context.nodesToIgnore.has(node)) {
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

  protected traverseChildren(node: ts.Node, context: VisitNodeContext): string {
    const nodeFullCode = node
      .getChildren()
      .map((node) => this.visitNode(node, context))
      .join('');

    return nodeFullCode || node.getFullText();
  }

  protected replaceChild(
    node: ts.Node,
    context: VisitNodeContext,
    childToReplace: ts.Node,
    code: string,
  ): string {
    const nodeFullCode = node
      .getChildren()
      .map((node) =>
        node === childToReplace ? code : this.visitNode(node, context),
      )
      .join('');

    return nodeFullCode || node.getFullText();
  }

  protected filterChildren(
    node: ts.Node,
    context: VisitNodeContext,
    comparator: (node: ts.Node) => boolean,
  ): string {
    const nodeFullCode = node
      .getChildren()
      .map((node) => (comparator(node) ? this.visitNode(node, context) : ' '))
      .join('');

    return nodeFullCode || node.getFullText();
  }

  protected omitChildrenByKind(
    node: ts.Node,
    context: VisitNodeContext,
    childKind: SyntaxKind,
  ): string {
    return this.filterChildren(node, context, (n) => n.kind !== childKind);
  }

  protected dump(node: ts.Node, code: string): string {
    return this.context.nodesToFullyReplace.has(node)
      ? code
      : node.getFullText().replace(node.getText(), code);
  }

  protected toEitherType = (
    node: ts.Node,
    context: VisitNodeContext,
    types: ts.NodeArray<ts.TypeNode>,
  ): string | undefined => {
    const res =
      types
        .map(
          (t, i) =>
            `${i < types.length - 1 ? 'EitherType<' : ''}${this.visitNode(
              t,
              context,
            )}`,
        )
        .join(', ') + '>'.repeat(types.length - 1);
    if (res) {
      this.context.importEitherType = true;
    }
    return res;
  };

  protected toExplicitBooleanCondition: TransformerFn = (node) => {
    switch (node.kind) {
      case SyntaxKind.TrueKeyword:
      case SyntaxKind.FalseKeyword:
        return node.getText();
      case SyntaxKind.NullKeyword:
        return 'false';
    }

    if (ts.isNumericLiteral(node)) {
      return node.text === '0' ? 'false' : 'true';
    }
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      return node.text === '' ? 'false' : 'true';
    }
    if (
      ts.isArrayLiteralExpression(node) ||
      ts.isObjectLiteralExpression(node)
    ) {
      return 'true';
    }

    if (!ts.isIdentifier(node)) return;

    if (node.text === 'undefined' || node.text === 'NaN') {
      return 'false';
    }

    const type = this.typeChecker.getTypeAtLocation(node);
    if (
      ts.TypeFlags.Boolean & type.flags ||
      ts.TypeFlags.BooleanLiteral & type.flags
    ) {
      return node.getText();
    }
    if (ts.TypeFlags.Number & type.flags) {
      return `${node.getText()} != 0`;
    }
    if (ts.TypeFlags.String & type.flags) {
      return `${node.getText()} != ""`;
    }
    return `${node.getText()} != null`;
  };

  protected toSeparateStatements(
    node: ts.Node,
    context: VisitNodeContext,
  ): string {
    if (
      !(
        ts.isBinaryExpression(node) &&
        node.operatorToken.kind === SyntaxKind.CommaToken
      )
    ) {
      return this.visitNode(node, context);
    }
    return `${TsUtils.getIndent(node)}${this.visitNode(
      node.left,
      context,
    )};\n${TsUtils.getIndent(node)}${this.visitNode(node.right, context)};\n`;
  }

  protected getDeclarationSourceFile(node: ts.Node): ts.SourceFile | undefined {
    const symbol = this.typeChecker.getSymbolAtLocation(node);
    if (!symbol) return;
    const aliasedSymbol = this.typeChecker.getAliasedSymbol(symbol);
    return aliasedSymbol?.declarations?.[0].getSourceFile();
  }

  protected ignoreNode(node: ts.Node): void {
    this.context.nodesToIgnore.add(node);
  }

  protected replaceNodeFully(node: ts.Node): void {
    this.context.nodesToFullyReplace.add(node);
  }

  protected ignoreNextNodeOfKind(node: ts.Node, kind: SyntaxKind): void {
    const nextNode = TsUtils.getNextNode(node);
    if (nextNode?.kind === kind) {
      this.ignoreNode(nextNode);
    }
  }
}
