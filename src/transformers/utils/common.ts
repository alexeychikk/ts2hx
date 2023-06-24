import ts, { SyntaxKind } from 'typescript';
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

export function replaceChild(
  this: Transformer,
  node: ts.Node,
  context: VisitNodeContext,
  childToReplace: ts.Node,
  code: string,
): string {
  const nodeFullCode = node
    .getChildren()
    .map((node) =>
      node === childToReplace ? code : this.visitNode(node, context),
    )
    .join('');

  return nodeFullCode || node.getFullText();
}

export function filterChildren(
  this: Transformer,
  node: ts.Node,
  context: VisitNodeContext,
  comparator: (node: ts.Node) => boolean,
  separator = '',
): string {
  const nodeFullCode = node
    .getChildren()
    .map((node) => (comparator(node) ? this.visitNode(node, context) : ' '))
    .join(separator);

  return nodeFullCode || node.getFullText();
}

export function omitChildrenByKind(
  this: Transformer,
  node: ts.Node,
  context: VisitNodeContext,
  childKind: SyntaxKind,
): string {
  return this.utils.filterChildren(node, context, (n) => n.kind !== childKind);
}

export function ignoreNextNodeOfKind(
  this: Transformer,
  node: ts.Node,
  kind: SyntaxKind,
): void {
  const nextNode = this.utils.getNextNode(node);
  if (nextNode?.kind === kind) {
    this.ignoreNode(nextNode);
  }
}

export function ignoreChildrenOfKind(
  this: Transformer,
  node: ts.Node,
  kind: SyntaxKind,
): void {
  node.getChildren().forEach((child) => {
    if (child.kind === kind) this.ignoreNode(child);
  });
}

export function joinNodes<T extends ts.Node>(
  this: Transformer,
  nodes: ts.NodeArray<T> | T[] | undefined,
  context: VisitNodeContext,
  separator = ', ',
): string {
  return nodes?.map((tp) => this.visitNode(tp, context)).join(separator) ?? '';
}

export function joinTypeParameters(
  this: Transformer,
  typeParameters:
    | ts.NodeArray<ts.TypeParameterDeclaration>
    | ts.TypeParameterDeclaration[]
    | undefined,
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

export function parenthesize(
  this: Transformer,
  node: ts.Node,
  context: VisitNodeContext,
): string {
  const code = this.visitNode(node, context);
  return ts.isIdentifier(node) ? code : `(${code})`;
}

export function getExtendedNode(
  this: Transformer,
  node: ts.ClassLikeDeclaration,
): ts.Node | undefined {
  return node.heritageClauses?.find(
    (her) => her.token === SyntaxKind.ExtendsKeyword,
  )?.types?.[0];
}

export function renameSymbol(
  this: Transformer,
  node: ts.Node,
  renameTo: string,
): string {
  const oldName = node.getText();
  const symbolsMap = this.symbolsToRename[oldName] ?? new Map();
  this.symbolsToRename[oldName] = symbolsMap;
  const name = symbolsMap.size > 0 ? `${renameTo}${symbolsMap.size}` : renameTo;
  symbolsMap.set(this.typeChecker.getSymbolAtLocation(node)!, name);
  return name;
}
