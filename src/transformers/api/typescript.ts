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
      this.imports.dynamicAccess = true;
      return `DynamicAccess<${
        node.typeArguments?.[1]
          ? this.emitNode(node.typeArguments[1], context)
          : 'Dynamic'
      }>`;
    }
    case 'Required':
    case 'Partial':
    case 'Readonly': {
      logger.warn(
        `${name}<T> type is not supported at`,
        this.utils.getNodeSourcePath(typeNode),
      );

      const typeParam = this.emitNode(node.typeArguments?.[0], context);

      return (
        this.utils.createComment(({ todo }) => `${todo} ${name}<`) +
        typeParam +
        this.utils.createComment(() => `>`)
      );
    }
  }
};
