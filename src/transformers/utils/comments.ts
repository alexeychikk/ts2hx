import ts from 'typescript';
import { logger } from '../../Logger';
import { type Transformer } from '../Transformer';

export function getIndent(this: Transformer, node: ts.Node): string {
  const sourceFile = node.getSourceFile();
  const { line } = ts.getLineAndCharacterOfPosition(
    sourceFile,
    node.getStart(),
  );
  const lineText = sourceFile.text.split('\n')[line];
  const indentationLength = lineText.search(/\S/);
  return lineText.slice(0, indentationLength);
}

export function getTodoString(this: Transformer): string {
  return this.includeTodos ? `TODO(ts2hx)` : '';
}

export function commentOutNode(
  this: Transformer,
  node: ts.Node,
  warning?: string,
): string {
  if (warning) {
    logger.warn(warning, this.utils.getNodeSourcePath(node));
  }

  return this.includeComments
    ? `${
        this.includeTodos ? `/* ${this.utils.getTodoString()} */\n` : ''
      }${this.utils.getIndent(node)}/* ${node.getText()} */`
    : '';
}

export function createComment(
  this: Transformer,
  fn: (params: { todo: string }) => string,
): string {
  return this.includeComments
    ? `/* ${fn({ todo: this.utils.getTodoString() })} */`
    : '';
}

export function createTodoComment(this: Transformer): string {
  return this.utils.createComment(({ todo }) => todo);
}
