import ts from 'typescript';
import { logger } from '../../Logger';
import { type Transpiler } from '../Transpiler';

export function getIndent(this: Transpiler, node: ts.Node): string {
  const sourceFile = node.getSourceFile();
  const { line } = ts.getLineAndCharacterOfPosition(
    sourceFile,
    node.getStart(),
  );
  const lineText = sourceFile.text.split('\n')[line];
  const indentationLength = lineText.search(/\S/);
  return lineText.slice(0, indentationLength);
}

export function getTodoString(this: Transpiler): string {
  return this.flags.includeTodos ? `TODO(ts2hx)` : '';
}

export function commentOutNode(
  this: Transpiler,
  node: ts.Node,
  warning?: string,
): string {
  if (warning) {
    logger.warn(warning, 'at', this.utils.getNodeSourcePath(node));
  }

  return this.flags.includeComments
    ? `${
        this.flags.includeTodos ? `/* ${this.utils.getTodoString()} */\n` : ''
      }${this.utils.getIndent(node)}/* ${node.getText()} */`
    : '';
}

export function createComment(
  this: Transpiler,
  fn: (params: { todo: string }) => string,
): string {
  return this.flags.includeComments
    ? `/* ${fn({ todo: this.utils.getTodoString() })} */`
    : '';
}

export function createTodoComment(this: Transpiler): string {
  return this.utils.createComment(({ todo }) => todo);
}
