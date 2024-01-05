import ts, { SyntaxKind } from 'typescript';
import {
  type VisitNodeContext,
  type Transpiler,
  type EmitFn,
} from '../Transpiler';

export const transformKeywords: EmitFn = function (this: Transpiler, node) {
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
    case SyntaxKind.ExportKeyword:
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

export const transformSimpleTemplate: EmitFn = function (
  this: Transpiler,
  node,
) {
  // `"Hello"`
  if (!ts.isNoSubstitutionTemplateLiteral(node)) return;
  return `"${this.utils.escapeStringText(node.text)}"`;
};

export const transformTemplateExpression: EmitFn = function (
  this: Transpiler,
  node,
  context,
) {
  // `foo ${varX} bar ${varY ? `inner ${varZ} end` : ""} baz`
  if (!ts.isTemplateExpression(node)) return;
  return `'${this.utils.escapeTemplateText(node.head.text)}${node.templateSpans
    .map((span) => `\${${this.emitNode(span, context)}`)
    .join('')}'`;
};

export const transformTemplateParts: EmitFn = function (
  this: Transpiler,
  node,
) {
  if (!ts.isTemplateMiddleOrTemplateTail(node)) return;
  return `}${this.utils.escapeTemplateText(node.text)}`;
};

export const transformRegex: EmitFn = function (this: Transpiler, node) {
  // /[a-z]{0,9}/gim
  if (!ts.isRegularExpressionLiteral(node)) return;
  return `~${node.text}`;
};

export const transformVoidExpression: EmitFn = function (
  this: Transpiler,
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
    return `(function() {${this.emitNode(node.expression, context)};})()`;
  }
};

export const transformTypeofExpression: EmitFn = function (
  this: Transpiler,
  node,
  context,
) {
  if (!ts.isTypeOfExpression(node)) return;

  return `Ts2hx.typeof(${this.emitNode(node.expression, context)})`;
};

export const transformInstanceOfExpression: EmitFn = function (
  this: Transpiler,
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

  const left = this.emitNode(node.left, context).trim();
  const right = this.emitNode(node.right, context).trim();

  return `Std.isOfType(${left}, ${right})`;
};

export const transformImportDeclaration: EmitFn = function (
  this: Transpiler,
  node,
  context,
) {
  if (!ts.isImportDeclaration(node)) return;

  // import './foo';
  if (!node.importClause) {
    return this.utils.commentOutNode(
      node,
      `Side-effect only import is not supported`,
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

    return `import ${this.utils.getImportedPackageName(fileName)}.${
      aliasedSymbol.name
    }${symbol.name !== aliasedSymbol.name ? ` as ${symbol.name}` : ''};`;
  }

  // import { foo, bar as quz } from './foo';
  if (ts.isNamedImports(node.importClause.namedBindings)) {
    return node.importClause.namedBindings.elements
      .map((el) => {
        const fileName = this.utils.getDeclarationSourceFile(el.name)?.fileName;
        if (!fileName) return;

        return `import ${this.utils.getImportedPackageName(fileName)}.${
          el.propertyName?.text ?? el.name.text
        }${el.propertyName ? ` as ${el.name.text}` : ''};`;
      })
      .filter(Boolean)
      .join('\n');
  }

  // import * as Foo from './foo';
  if (ts.isNamespaceImport(node.importClause.namedBindings)) {
    return this.utils.commentOutNode(node, `Namespace import is not supported`);
  }

  return '';
};

export const transformRenameSymbol: EmitFn = function (
  this: Transpiler,
  node,
  context: VisitNodeContext,
) {
  if (node.pos === -1) return;

  const key = Buffer.from(node.getText()).toString('base64');
  const symbolsMap = this.symbolsToRename[key];
  if (!symbolsMap) return;
  const symbol = this.typeChecker.getSymbolAtLocation(node);
  if (!symbol) return;

  const renameTo = symbolsMap.get(symbol);
  if (renameTo === undefined) return;

  return renameTo;
};
