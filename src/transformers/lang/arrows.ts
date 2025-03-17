import ts from 'typescript';
import { type Transpiler, type EmitFn } from '../Transpiler';

export const transformNewArrowFunction: EmitFn = function (
  this: Transpiler,
  node,
  context,
) {
  if (!ts.isArrowFunction(node)) return;

  const params = this.utils.joinNodes(node.parameters, context);
  const returnType = node.type ? `: ${this.emitNode(node.type, context)}` : '';
  const body = this.emitNode(node.body, context);

  if (ts.isBlock(node.body)) {
    return `function (${params})${returnType} ${body}`;
  }

  return `(${params})${returnType} -> ${body.trimStart()}`;
};
