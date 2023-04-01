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
    logger.warn(
      `void expression is not supported at`,
      TsUtils.getNodeSourcePath(node),
    );

    return `${TsUtils.commentOutNode(node)} null`;
  }
};
