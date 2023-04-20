import ts, { SyntaxKind } from 'typescript';
import { logger } from '../../Logger';
import { TsUtils } from '../../TsUtils';
import { type Transformer, type TransformerFn } from '../Transformer';

export const transformKeywords: TransformerFn = function (
  this: Transformer,
  node,
) {
  switch (node.kind) {
    // myVar: number
    case SyntaxKind.NumberKeyword:
      return 'Float';
    // myVar: string
    case SyntaxKind.StringKeyword:
      return 'String';
    // myVar: boolean
    case SyntaxKind.BooleanKeyword:
      return 'Bool';
    // myVar: undefined
    case SyntaxKind.UndefinedKeyword:
      return 'Null<Void>';
    case SyntaxKind.VoidKeyword:
      return 'Void';
    // myVar: unknown
    case SyntaxKind.UnknownKeyword:
    // myVar: any
    case SyntaxKind.AnyKeyword:
      return 'Any';
    // type T = ...
    case SyntaxKind.TypeKeyword:
      return 'typedef';
    // (myVar as string)
    case SyntaxKind.AsKeyword:
      return ':';
    case SyntaxKind.ExportKeyword:
      return '@:export';
    case SyntaxKind.ProtectedKeyword:
      return 'private';
    case SyntaxKind.Identifier:
      switch (node.getText()) {
        // myVar = undefined
        case 'undefined':
          return 'null';
        // myVar = NaN
        case 'NaN':
          return 'Math.NaN';
      }
  }
};

export const transformSimpleTemplate: TransformerFn = function (
  this: Transformer,
  node,
) {
  // `"Hello"`
  if (!ts.isNoSubstitutionTemplateLiteral(node)) return;
  return `"${TsUtils.escapeStringText(node.text)}"`;
};

export const transformTemplateExpression: TransformerFn = function (
  this: Transformer,
  node,
  context,
) {
  // `foo ${varX} bar ${varY ? `inner ${varZ} end` : ""} baz`
  if (!ts.isTemplateExpression(node)) return;
  return `'${TsUtils.escapeTemplateText(node.head.text)}${node.templateSpans
    .map((span) => `\${${this.visitNode(span, context)}`)
    .join('')}'`;
};

export const transformTemplateParts: TransformerFn = function (
  this: Transformer,
  node,
) {
  if (!ts.isTemplateMiddleOrTemplateTail(node)) return;
  return `}${TsUtils.escapeTemplateText(node.text)}`;
};

export const transformRegex: TransformerFn = function (
  this: Transformer,
  node,
) {
  // /[a-z]{0,9}/gim
  if (!ts.isRegularExpressionLiteral(node)) return;
  return `~${node.text}`;
};

export const transformAsExpression: TransformerFn = function (
  this: Transformer,
  node,
  context,
) {
  if (!ts.isAsExpression(node)) return;

  // as const
  if (
    ts.isTypeReferenceNode(node.type) &&
    node.type.typeName.getText() === 'const'
  ) {
    return this.visitNode(node.expression, context);
  }

  // myVar = hisVar as T
  if (!ts.isParenthesizedExpression(node.parent)) {
    return `(${this.traverseChildren(node, context)})`;
  }
};

export const transformVoidExpression: TransformerFn = function (
  this: Transformer,
  node,
  context,
) {
  if (!ts.isVoidExpression(node)) return;
  if (
    ts.isLiteralExpression(node.expression) ||
    ts.isIdentifier(node.expression)
  ) {
    return `null`;
  } else {
    const comment = TsUtils.commentOutNode(
      node,
      `void expression is not supported at`,
    );
    return `${comment} null`;
  }
};

export const transformTypeofExpression: TransformerFn = function (
  this: Transformer,
  node,
  context,
) {
  if (!ts.isTypeOfExpression(node)) return;

  this.context.importTs2hx = true;
  return `Ts2hx.typeof(${this.visitNode(node.expression, context)})`;
};

export const transformImportDeclaration: TransformerFn = function (
  this: Transformer,
  node,
  context,
) {
  if (!ts.isImportDeclaration(node)) return;

  // import './foo';
  if (!node.importClause) {
    return TsUtils.commentOutNode(
      node,
      `Side-effect only import is not supported at`,
    );
  }

  // import foo from './foo';
  if (!node.importClause.namedBindings) {
    const symbol = this.typeChecker.getSymbolAtLocation(
      node.importClause.name!,
    );
    if (!symbol) return '';
    const aliasedSymbol = this.typeChecker.getAliasedSymbol(symbol);
    const fileName = aliasedSymbol?.declarations?.[0].getSourceFile().fileName;
    if (!fileName) return '';

    return `import ${this.getImportedPackageName(fileName)}.${
      aliasedSymbol.name
    }${symbol.name !== aliasedSymbol.name ? ` as ${symbol.name}` : ''};`;
  }

  // import { foo, bar as quz } from './foo';
  if (ts.isNamedImports(node.importClause.namedBindings)) {
    return node.importClause.namedBindings.elements
      .map((el) => {
        const fileName = this.getDeclarationSourceFile(el.name)?.fileName;
        if (!fileName) return;

        return `import ${this.getImportedPackageName(fileName)}.${
          el.propertyName?.text ?? el.name.text
        }${el.propertyName ? ` as ${el.name.text}` : ''};`;
      })
      .filter(Boolean)
      .join('\n');
  }

  // import * as Foo from './foo';
  if (ts.isNamespaceImport(node.importClause.namedBindings)) {
    logger.warn(
      `Namespace import is not supported at`,
      TsUtils.getNodeSourcePath(node),
    );
    return TsUtils.commentOutNode(node);
  }

  return '';
};
