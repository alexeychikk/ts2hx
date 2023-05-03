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

export const transformJsIdentifiers: TransformerFn = function (
  this: Transformer,
  node,
) {
  if (!ts.isIdentifier(node)) return;

  // match by text first to skip heavy type checking if possible
  const code: string | undefined = (() => {
    switch (node.getText()) {
      case 'Error':
        this.context.importException = true;
        return 'Exception';
    }
  })();

  if (code === undefined || !this.isBuiltInNode(node)) return;

  return code;
};
