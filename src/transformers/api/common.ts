import ts from 'typescript';
import { type Transpiler, type TransformerFn } from '../Transpiler';

export const transformJsApiAccess: TransformerFn = function (
  this: Transpiler,
  node,
) {
  if (!ts.isPropertyAccessExpression(node)) return;

  const code: string | undefined = (() => {
    switch (node.getText()) {
      case 'console.log':
        return 'trace';
    }
  })();

  if (code === undefined || !this.utils.isBuiltInNode(node.expression)) return;
  return code;
};

export const transformJsIdentifiers: TransformerFn = function (
  this: Transpiler,
  node,
) {
  if (!ts.isIdentifier(node)) return;

  // match by text first to skip heavy type checking if possible
  const code: string | undefined = (() => {
    switch (node.getText()) {
      case 'Error':
        this.imports.exception = true;
        return 'Exception';
    }
  })();

  if (code === undefined || !this.utils.isBuiltInNode(node)) return;

  return code;
};
