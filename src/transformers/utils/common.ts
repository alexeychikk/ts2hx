import ts, { SyntaxKind } from 'typescript';
import { type VisitNodeContext, type Transpiler } from '../Transpiler';
import { TranspilerError } from '../../utils';

export function getNextNode(
  this: Transpiler,
  node: ts.Node,
  parent = this.utils.getDirectParent(node),
): ts.Node | undefined {
  if (!parent) return;
  const nodeIndex = parent.getChildren().findIndex((n) => n === node);
  return parent.getChildAt(nodeIndex + 1);
}
export function getPrevNode(
  this: Transpiler,
  node: ts.Node,
  parent = this.utils.getDirectParent(node),
): ts.Node | undefined {
  if (!parent) return;
  const nodeIndex = parent.getChildren().findIndex((n) => n === node);
  return parent.getChildAt(nodeIndex - 1);
}

export function getDirectParent(
  this: Transpiler,
  node: ts.Node,
): ts.Node | undefined {
  if (!node.parent) return;
  const children = node.parent.getChildren();
  return children.includes(node)
    ? node.parent
    : children.find((ch) => ch.getChildren().includes(node));
}

export function getNodeSourcePath(this: Transpiler, node: ts.Node): string {
  const sourceFile = node.getSourceFile();
  const { line, character } = ts.getLineAndCharacterOfPosition(
    sourceFile,
    node.pos,
  );
  return `${sourceFile.fileName}:${line + 1}:${character + 1}`;
}

export function replaceChild(
  this: Transpiler,
  node: ts.Node,
  context: VisitNodeContext,
  childToReplace: ts.Node,
  code: string,
): string {
  const nodeFullCode = node
    .getChildren()
    .map((node) =>
      node === childToReplace ? code : this.emitNode(node, context),
    )
    .join('');

  return nodeFullCode || node.getFullText();
}

export function filterChildren(
  this: Transpiler,
  node: ts.Node,
  context: VisitNodeContext,
  comparator: (node: ts.Node) => boolean,
  separator = '',
): string {
  const nodeFullCode = node
    .getChildren()
    .map((node) => (comparator(node) ? this.emitNode(node, context) : ' '))
    .join(separator);

  return nodeFullCode || node.getFullText();
}

export function omitChildrenByKind(
  this: Transpiler,
  node: ts.Node,
  context: VisitNodeContext,
  childKind: SyntaxKind,
): string {
  return this.utils.filterChildren(node, context, (n) => n.kind !== childKind);
}

export function ignoreNextNodeOfKind(
  this: Transpiler,
  node: ts.Node,
  kind: SyntaxKind,
): void {
  const nextNode = this.utils.getNextNode(node);
  if (nextNode?.kind === kind) {
    this.ignoreNode(nextNode);
  }
}

export function ignoreChildrenOfKind(
  this: Transpiler,
  node: ts.Node,
  kind: SyntaxKind,
): void {
  node.getChildren().forEach((child) => {
    if (child.kind === kind) this.ignoreNode(child);
  });
}

export function joinNodes<T extends ts.Node>(
  this: Transpiler,
  nodes: ts.NodeArray<T> | T[] | undefined,
  context: VisitNodeContext,
  separator = ', ',
): string {
  return nodes?.map((tp) => this.emitNode(tp, context)).join(separator) ?? '';
}

export function joinTypeParameters(
  this: Transpiler,
  typeParameters:
    | ts.NodeArray<ts.TypeParameterDeclaration>
    | ts.TypeParameterDeclaration[]
    | undefined,
  context: VisitNodeContext,
): string {
  const typeParams = this.utils.joinNodes(typeParameters, context);
  return typeParams ? `<${typeParams}>` : '';
}

export function escapeStringText(this: Transpiler, text: string): string {
  return text.replace(/"/g, `\\"`);
}

export function escapeTemplateText(this: Transpiler, text: string): string {
  return text.replace(/'/g, `\\'`);
}

/**
 * Examples:
 * ```
 * 3foo ==> _3foo
 * $$foo$bar ==> $_foo_bar
 * foo.bar.baz ==> foo_bar_baz
 * ```
 */
export function toHaxeIdentifier(this: Transpiler, text: string): string {
  return text
    .replace(/^([^a-z_$])/i, '_$1')
    .replace(/(?<=.)\$/g, '_')
    .replace(/[^a-z0-9_$]/gi, '_');
}

export function visitParenthesized(
  this: Transpiler,
  node: ts.Node,
  context: VisitNodeContext,
): string {
  const code = this.emitNode(node, context).trim();
  return ts.isIdentifier(node) ? code : `(${code})`;
}

export function isParenthesized(this: Transpiler, node: ts.Node): boolean {
  return (
    ts.isParenthesizedExpression(node) ||
    (this.utils.getPrevNode(node)?.kind === SyntaxKind.OpenParenToken &&
      this.utils.getNextNode(node)?.kind === SyntaxKind.CloseParenToken)
  );
}

export function parenthesizeCode(
  this: Transpiler,
  node: ts.Node,
  code: string,
): string {
  return this.utils.isParenthesized(node) ? code : `(${code})`;
}

export function getExtendedNode(
  this: Transpiler,
  node: ts.ClassLikeDeclaration,
): ts.Node | undefined {
  return node.heritageClauses?.find(
    (her) => her.token === SyntaxKind.ExtendsKeyword,
  )?.types?.[0];
}

export function renameSymbol(
  this: Transpiler,
  node: ts.Node,
  renameTo: string,
): string {
  const key = Buffer.from(node.getText()).toString('base64');
  const symbolsMap = this.symbolsToRename[key] ?? new Map();
  this.symbolsToRename[key] = symbolsMap;
  const name = symbolsMap.size > 0 ? `${renameTo}${symbolsMap.size}` : renameTo;
  symbolsMap.set(this.typeChecker.getSymbolAtLocation(node)!, name);
  return name;
}

export function ensureNodeIsBlock(
  this: Transpiler,
  node: ts.Statement | ts.Expression | ts.Block,
  context: ts.TransformationContext,
  parentNode: ts.Node,
): ts.Block {
  if (ts.isBlock(node)) return node;
  if (ts.isStatement(node)) return context.factory.createBlock([node], true);
  if (ts.isExpression(node) && ts.isArrowFunction(parentNode)) {
    return context.factory.createBlock(
      [context.factory.createReturnStatement(node)],
      true,
    );
  }

  throw new TranspilerError('Unable to transform node to Block', node);
}
