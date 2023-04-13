import ts from 'typescript';
import { TsUtils } from '../../TsUtils';
import { logger } from '../../Logger';
import { type Transformer, type TransformerFn } from '../Transformer';

export const transformTsLibTypes: TransformerFn = function (
  this: Transformer,
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
    case 'Record':
      this.context.importDynamicAccess = true;
      return `DynamicAccess<${
        node.typeArguments?.[1]
          ? this.visitNode(node.typeArguments[1], context)
          : 'Dynamic'
      }>`;
    case 'Required':
    case 'Partial':
    case 'Readonly':
      logger.warn(
        `${name}<T> type is not supported at`,
        TsUtils.getNodeSourcePath(typeNode),
      );
      return `/* ${TsUtils.todoString} ${name}< */ ${this.visitNode(
        node.typeArguments?.[0],
        context,
      )} /* > */`;
  }
};
