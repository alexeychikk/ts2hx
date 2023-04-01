import ts from 'typescript';
import { type Transformer, type TransformerFn } from '../Transformer';

export const transformArrowFnToken: TransformerFn = function (
  this: Transformer,
  node,
) {
  if (!ts.isEqualsGreaterThanToken(node)) return;
  return `->`;
};
