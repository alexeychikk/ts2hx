import ts from 'typescript';
import { type TransformerFn, type Transpiler } from '../Transpiler';

export const transformTemplateLiteralType: TransformerFn = function (
  this: Transpiler,
  node,
  context,
) {
  /* type A = 'foo' | 'bar';
     type B = `Hello ${A}`; */
  if (!ts.isTemplateLiteralTypeNode(node)) return;

  return context.factory.createKeywordTypeNode(ts.SyntaxKind.StringKeyword);
};
