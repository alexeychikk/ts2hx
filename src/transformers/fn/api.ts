import ts from 'typescript';
import { type Transformer, type TransformerFn } from '../Transformer';

export const transformJsApiAccess: TransformerFn = function (
  this: Transformer,
  node,
) {
  if (!ts.isPropertyAccessExpression(node)) return;
  switch (node.getText()) {
    case 'console.log':
      return 'trace';
  }
};
