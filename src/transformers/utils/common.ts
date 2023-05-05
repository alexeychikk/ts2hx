import ts from 'typescript';
import { type VisitNodeContext, type Transformer } from '../Transformer';

export function getNextNode(
  this: Transformer,
  node: ts.Node,
  parent = this.utils.getDirectParent(node),
): ts.Node | undefined {
  if (!parent) return;
  const nodeIndex = parent.getChildren().findIndex((n) => n === node);
  return parent.getChildAt(nodeIndex + 1);
}

export function getDirectParent(
  this: Transformer,
  node: ts.Node,
): ts.Node | undefined {
  if (!node.parent) return;
  const children = node.parent.getChildren();
  return children.includes(node)
    ? node.parent
    : children.find((ch) => ch.getChildren().includes(node));
}

export function getNodeSourcePath(this: Transformer, node: ts.Node): string {
  const sourceFile = node.getSourceFile();
  const { line, character } = ts.getLineAndCharacterOfPosition(
    sourceFile,
    node.getStart(),
  );
  return `${sourceFile.fileName}:${line + 1}:${character + 1}`;
}

export function joinNodes<T extends ts.Node>(
  this: Transformer,
  nodes: ts.NodeArray<T> | undefined,
  context: VisitNodeContext,
  separator = ', ',
): string {
  return nodes?.map((tp) => this.visitNode(tp, context)).join(separator) ?? '';
}

export function joinTypeParameters(
  this: Transformer,
  typeParameters: ts.NodeArray<ts.TypeParameterDeclaration> | undefined,
  context: VisitNodeContext,
): string {
  const typeParams = this.utils.joinNodes(typeParameters, context);
  return typeParams ? `<${typeParams}>` : '';
}

export function escapeStringText(this: Transformer, text: string): string {
  return text.replace(/"/g, `\\"`);
}

export function escapeTemplateText(this: Transformer, text: string): string {
  return text.replace(/'/g, `\\'`);
}
