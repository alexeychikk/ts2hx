import ts, { SyntaxKind } from 'typescript';
import { type Transformer, type TransformerFn } from '../Transformer';

export const transformVariableStatement: TransformerFn = function (
  this: Transformer,
  node,
  context,
) {
  // /** JS doc */ var foo = "bar";
  if (!ts.isVariableStatement(node)) return;
  // For some reason VariableDeclarationList.getFullText() includes text of
  // JSDoc node from parent VariableStatement thus duplicating this comment
  // when a node is finally dumped after transformation
  this.replaceNodeFully(node);
  return this.omitChildrenByKind(node, context, SyntaxKind.JSDoc);
};

export const transformVariableDeclarationList: TransformerFn = function (
  this: Transformer,
  node,
  context,
) {
  // let foo: string, bar = 4
  if (!ts.isVariableDeclarationList(node)) return;
  const keyword = node.flags & ts.NodeFlags.Const ? 'final' : 'var';
  return node.declarations
    .map(
      (dec, i) =>
        `${i > 0 ? this.utils.getIndent(dec) : ''}${keyword} ${this.visitNode(
          dec,
          context,
        ).trimStart()}`,
    )
    .join(';\n');
};

export const transformVariableDeclaration: TransformerFn = function (
  this: Transformer,
  node,
  context,
) {
  // foo: number = 5
  if (!ts.isVariableDeclaration(node)) return;
  return `${node.name.getText()}${
    node.type ? `: ${this.visitNode(node.type, context)}` : ''
  }${
    node.initializer ? ` = ${this.visitNode(node.initializer, context)}` : ''
  }`;
};
