import ts, { SyntaxKind } from 'typescript';
import {
  type VisitNodeContext,
  type Transformer,
  type TransformerFn,
} from '../Transformer';

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
      return 'Null<Any>';
    case SyntaxKind.VoidKeyword:
    case SyntaxKind.NeverKeyword:
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
    case SyntaxKind.AsyncKeyword:
      return '@async';
    case SyntaxKind.AwaitKeyword:
      return '@await';
    case SyntaxKind.ExportAssignment:
    case SyntaxKind.ExportDeclaration:
      return ' ';
    case SyntaxKind.ExportKeyword:
      return ' ';
    case SyntaxKind.ReadonlyKeyword:
      return ' ';
    case SyntaxKind.ProtectedKeyword:
      return 'private';
    case SyntaxKind.EqualsGreaterThanToken:
      return '->';
    case SyntaxKind.EqualsEqualsEqualsToken:
      return '==';
    case SyntaxKind.ExclamationEqualsEqualsToken:
      return '!=';
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

export const transformPowExpression: TransformerFn = function (
  this: Transformer,
  node,
  context,
) {
  // myNum ** 3
  if (!ts.isBinaryExpression(node)) return;

  if (node.operatorToken.kind === SyntaxKind.AsteriskAsteriskToken) {
    return `Math.pow(${this.visitNode(node.left, context)}, ${this.visitNode(
      node.right,
      context,
    )})`;
  }

  if (node.operatorToken.kind === SyntaxKind.AsteriskAsteriskEqualsToken) {
    const left = this.visitNode(node.left, context);
    return `${left} = Math.pow(${left.trim()}, ${this.visitNode(
      node.right,
      context,
    )})`;
  }
};

export const transformSimpleTemplate: TransformerFn = function (
  this: Transformer,
  node,
) {
  // `"Hello"`
  if (!ts.isNoSubstitutionTemplateLiteral(node)) return;
  return `"${this.utils.escapeStringText(node.text)}"`;
};

export const transformTemplateExpression: TransformerFn = function (
  this: Transformer,
  node,
  context,
) {
  // `foo ${varX} bar ${varY ? `inner ${varZ} end` : ""} baz`
  if (!ts.isTemplateExpression(node)) return;
  return `'${this.utils.escapeTemplateText(node.head.text)}${node.templateSpans
    .map((span) => `\${${this.visitNode(span, context)}`)
    .join('')}'`;
};

export const transformTemplateParts: TransformerFn = function (
  this: Transformer,
  node,
) {
  if (!ts.isTemplateMiddleOrTemplateTail(node)) return;
  return `}${this.utils.escapeTemplateText(node.text)}`;
};

export const transformRegex: TransformerFn = function (
  this: Transformer,
  node,
) {
  // /[a-z]{0,9}/gim
  if (!ts.isRegularExpressionLiteral(node)) return;
  return `~${node.text}`;
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
    return `(function() {${this.visitNode(node.expression, context)};})()`;
  }
};

export const transformTypeofExpression: TransformerFn = function (
  this: Transformer,
  node,
  context,
) {
  if (!ts.isTypeOfExpression(node)) return;

  return `Ts2hx.typeof(${this.visitNode(node.expression, context)})`;
};

export const transformInstanceOfExpression: TransformerFn = function (
  this: Transformer,
  node,
  context,
) {
  // error instanceof Error
  if (
    !(
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === SyntaxKind.InstanceOfKeyword
    )
  )
    return;

  const left = this.visitNode(node.left, context).trim();
  const right = this.visitNode(node.right, context).trim();

  return `Std.isOfType(${left}, ${right})`;
};

export const transformImportDeclaration: TransformerFn = function (
  this: Transformer,
  node,
  context,
) {
  if (!ts.isImportDeclaration(node)) return;

  // import './foo';
  if (!node.importClause) {
    return this.utils.commentOutNode(
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
        const fileName = this.utils.getDeclarationSourceFile(el.name)?.fileName;
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
    return this.utils.commentOutNode(
      node,
      `Namespace import is not supported at`,
    );
  }

  return '';
};

export const transformRenameSymbol: TransformerFn = function (
  this: Transformer,
  node,
  context: VisitNodeContext,
) {
  const symbolsMap = this.symbolsToRename[node.getText()];
  if (!symbolsMap) return;
  const symbol = this.typeChecker.getSymbolAtLocation(node);
  if (!symbol) return;

  const renameTo = symbolsMap.get(symbol);
  if (renameTo === undefined) return;

  return renameTo;
};
