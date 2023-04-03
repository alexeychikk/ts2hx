import ts from 'typescript';
import { type Transformer, type TransformerFn } from '../Transformer';

export const transformTsLibTypes: TransformerFn = function (
  this: Transformer,
  node,
  context,
) {
  if (!ts.isTypeReferenceNode(node)) return;
  const type = this.typeChecker.getTypeAtLocation(node.typeName);
  const name = type.aliasSymbol?.name ?? type.symbol?.name;

  switch (name) {
    case 'Record':
      this.context.importDynamicAccess = true;
      return `DynamicAccess<${
        node.typeArguments?.[1]
          ? this.visitNode(node.typeArguments[1], context)
          : 'Dynamic'
      }>`;
  }
};
