import ts from 'typescript';
import { type Transformer, type TransformerFn } from '../Transformer';
import { TsUtils } from '../../TsUtils';

export const transformArrowFnToken: TransformerFn = function (
  this: Transformer,
  node,
) {
  if (!ts.isEqualsGreaterThanToken(node)) return;
  return `->`;
};

export const transformFunctionParameter: TransformerFn = function (
  this: Transformer,
  node,
  context,
) {
  if (!ts.isParameter(node)) return;

  const name = node.name.getText();
  const dotDotDotToken = node.dotDotDotToken ? '...' : '';

  let type = '';
  if (node.type) {
    if (dotDotDotToken) {
      type = this.visitNode(TsUtils.getArrayTypeNode(node.type), context);
    } else {
      type = this.visitNode(node.type, context);
    }
    type = `: ${type}`;
  }

  const initializer = node.initializer
    ? ` = ${this.visitNode(node.initializer, context)}`
    : '';
  const questionToken = node.questionToken ? `?` : '';

  return `${dotDotDotToken}${questionToken}${name}${type}${initializer}`;
};
