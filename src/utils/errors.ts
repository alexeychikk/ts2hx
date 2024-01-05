import type ts from 'typescript';
import { SyntaxKind } from 'typescript';

export class ConverterError extends Error {}

export class TranspilerError extends Error {
  constructor(message: string, public node?: ts.Node) {
    super(`${message}${node ? `\n${TranspilerError.getNodeInfo(node)}` : ''}`);
  }

  private static getNodeInfo(node: ts.Node): string {
    const { fileName, line, character } = (() => {
      try {
        return {
          fileName: node.getSourceFile().fileName,
          ...node.getSourceFile().getLineAndCharacterOfPosition(node.pos),
        };
      } catch {
        return { fileName: 'unknown', line: -1, character: -1 };
      }
    })();

    return (
      `Kind: ${SyntaxKind[node.kind]}\n` +
      `At: ${fileName}:${line + 1}:${character + 1}`
    );
  }
}
