import ts from 'typescript';
import { logger } from '../../Logger';
import { type Transpiler, type EmitFn } from '../Transpiler';

export const transformTsLibTypes: EmitFn = function (
  this: Transpiler,
  node,
  context,
) {
  if (!(ts.isTypeReferenceNode(node) || ts.isExpressionWithTypeArguments(node)))
    return;

  const typeNode =
    (node as ts.TypeReferenceNode).typeName ??
    (node as ts.ExpressionWithTypeArguments).expression;
  const type = this.typeChecker.getTypeAtLocation(typeNode);
  const name = type.aliasSymbol?.name ?? type.symbol?.name;

  switch (name) {
    case 'Record': {
      return `Dynamic${
        node.typeArguments?.[1]
          ? `<${this.emitNode(node.typeArguments[1], context)}>`
          : ''
      }`;
    }
    case 'ReadonlyArray': {
      return `Array${
        node.typeArguments?.[0]
          ? `<${this.emitNode(node.typeArguments[0], context)}>`
          : '<Any>'
      }`;
    }
    case 'PromiseLike': {
      return `Promise${
        node.typeArguments?.[0]
          ? `<${this.emitNode(node.typeArguments[0], context)}>`
          : '<Any>'
      }`;
    }
    // the following approximate to their (first) type argument
    case 'Required':
    case 'Partial':
    case 'Readonly':
    case 'Exclude':
    case 'Extract':
    case 'NonNullable':
    case 'Awaited': {
      logger.warn(
        `${name}<T> type is not supported at`,
        this.utils.getNodeSourcePath(typeNode),
      );

      const typeParam = node.typeArguments?.[0]
        ? this.emitNode(node.typeArguments[0], context).trim()
        : '';

      return (
        this.utils.createComment(({ todo }) => `${todo} ${name}<`) +
        (typeParam || 'Any') +
        this.utils.createComment(() => `>`)
      );
    }
    // no reasonable structural equivalent — fall back to Any
    case 'Pick':
    case 'Omit':
    case 'ReturnType':
    case 'Parameters':
    case 'ConstructorParameters':
    case 'InstanceType':
    case 'ThisParameterType':
    case 'OmitThisParameter':
    case 'ThisType':
    case 'Uppercase':
    case 'Lowercase':
    case 'Capitalize':
    case 'Uncapitalize': {
      logger.warn(
        `${name}<T> type is not supported at`,
        this.utils.getNodeSourcePath(typeNode),
      );

      return (
        this.utils.createComment(({ todo }) => `${todo} ${node.getText()}`) +
        ' Dynamic'
      );
    }
  }
};

/**
 * Types that exist both in TS and Haxe (or are mapped by other emitters) —
 * type references to them must not be replaced with Any
 */
const KNOWN_EXTERNAL_TYPES = new Set([
  'Array',
  'ReadonlyArray',
  'Promise',
  'PromiseLike',
  'Map',
  'Set',
  'Error',
  'String',
  'Number',
  'Boolean',
  'RegExp',
  'Date',
  'Record',
  'Required',
  'Partial',
  'Readonly',
  'Exclude',
  'Extract',
  'NonNullable',
  'Awaited',
  'Pick',
  'Omit',
  'ReturnType',
  'Parameters',
  'ConstructorParameters',
  'InstanceType',
  'ThisParameterType',
  'OmitThisParameter',
  'ThisType',
  'Uppercase',
  'Lowercase',
  'Capitalize',
  'Uncapitalize',
]);

/**
 * References to types declared in node_modules (npm packages, TS lib) have no
 * Haxe counterpart — emit Any with the original type in a comment.
 */
export const transformExternalTypeReference: EmitFn = function (
  this: Transpiler,
  node,
  context,
) {
  if (!ts.isTypeReferenceNode(node)) return;

  const name = ts.isIdentifier(node.typeName)
    ? node.typeName.text
    : node.typeName.right.text;
  if (KNOWN_EXTERNAL_TYPES.has(name)) return;

  const declarations = this.utils.getRootSymbol(node.typeName)?.declarations;
  if (!declarations?.length) return;
  const isExternal = declarations.every((declaration) =>
    /[\\/]node_modules[\\/]/.test(declaration.getSourceFile().fileName),
  );
  if (!isExternal) return;

  logger.warn(
    `External type is not supported at`,
    this.utils.getNodeSourcePath(node),
  );

  // Dynamic, unlike Any, keeps the value callable and its fields accessible
  return (
    this.utils.createComment(({ todo }) => `${todo} ${node.getText()}`) +
    ' Dynamic'
  );
};
