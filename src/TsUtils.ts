import ts, { SyntaxKind } from 'typescript';
import { logger } from './Logger';

export class TsUtils {
  static includeTodos = true;
  static includeComments = true;

  static getNextNode(
    node: ts.Node,
    parent = TsUtils.getDirectParent(node),
  ): ts.Node | undefined {
    if (!parent) return;
    const nodeIndex = parent.getChildren().findIndex((n) => n === node);
    return parent.getChildAt(nodeIndex + 1);
  }

  static getDirectParent(node: ts.Node): ts.Node | undefined {
    if (!node.parent) return;
    const children = node.parent.getChildren();
    return children.includes(node)
      ? node.parent
      : children.find((ch) => ch.getChildren().includes(node));
  }

  static isOperandOfConditionalExpression(node: ts.Node): boolean {
    return (
      !!node.parent &&
      ts.isConditionalExpression(node.parent) &&
      node.parent.condition === node
    );
  }

  static isOperandOfBooleanExpression(node: ts.Node): boolean {
    return (
      !!node.parent &&
      ts.isBinaryExpression(node.parent) &&
      (node.parent.left === node || node.parent.right === node) &&
      [SyntaxKind.AmpersandAmpersandToken, SyntaxKind.BarBarToken].includes(
        node.parent.operatorToken.kind,
      )
    );
  }

  static isBooleanExpressionOfStatement(node: ts.Node): boolean {
    return (
      !!node.parent &&
      (ts.isIfStatement(node.parent) ||
        ts.isWhileStatement(node.parent) ||
        ts.isDoStatement(node.parent)) &&
      node.parent.expression === node
    );
  }

  static getIndent(node: ts.Node): string {
    const sourceFile = node.getSourceFile();
    const { line } = ts.getLineAndCharacterOfPosition(
      sourceFile,
      node.getStart(),
    );
    const lineText = sourceFile.text.split('\n')[line];
    const indentationLength = lineText.search(/\S/);
    return lineText.slice(0, indentationLength);
  }

  static getNodeSourcePath(node: ts.Node): string {
    const sourceFile = node.getSourceFile();
    const { line, character } = ts.getLineAndCharacterOfPosition(
      sourceFile,
      node.getStart(),
    );
    return `${sourceFile.fileName}:${line + 1}:${character + 1}`;
  }

  private static get todoString(): string {
    return TsUtils.includeTodos ? `TODO(ts2hx)` : '';
  }

  static commentOutNode(node: ts.Node, warning?: string): string {
    if (warning) {
      logger.warn(warning, TsUtils.getNodeSourcePath(node));
    }

    return TsUtils.includeComments
      ? `${
          TsUtils.includeTodos ? `/* ${TsUtils.todoString} */\n` : ''
        }${TsUtils.getIndent(node)}/* ${node.getText()} */`
      : '';
  }

  static createComment(fn: (params: { todo: string }) => string): string {
    return TsUtils.includeComments
      ? `/* ${fn({ todo: TsUtils.todoString })} */`
      : '';
  }

  static createTodoComment(): string {
    return TsUtils.createComment(({ todo }) => todo);
  }

  static getAccessModifier(node: ts.HasModifiers): ts.Modifier | undefined {
    return node.modifiers?.find(
      (modifier) =>
        modifier.kind === SyntaxKind.PublicKeyword ||
        modifier.kind === SyntaxKind.ProtectedKeyword ||
        modifier.kind === SyntaxKind.PrivateKeyword,
    ) as ts.Modifier | undefined;
  }

  static getAccessModifierString(node: ts.HasModifiers): string {
    const modifier = TsUtils.getAccessModifier(node);
    return !modifier || modifier.kind === SyntaxKind.PublicKeyword
      ? 'public'
      : 'private';
  }

  static escapeStringText(text: string): string {
    return text.replace(/"/g, `\\"`);
  }

  static escapeTemplateText(text: string): string {
    return text.replace(/'/g, `\\'`);
  }
}
