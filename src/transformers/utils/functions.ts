import ts, { SyntaxKind } from 'typescript';
import { type Transpiler } from '../Transpiler';

export function isAcceptableParameterDeclarationForHx(
  this: Transpiler,
  parameter: ts.ParameterDeclaration,
): boolean {
  return (
    ts.isIdentifier(parameter.name) &&
    (!parameter.initializer ||
      this.utils.isPrimitiveInitializer(parameter.initializer))
  );
}

export function moveVariableOrParameterDeclarationToBlock(
  this: Transpiler,
  node: ts.VariableDeclaration | ts.ParameterDeclaration,
  identifier: ts.Identifier,
  block: ts.Block,
  context: ts.TransformationContext,
): ts.Block {
  const initializer =
    node.initializer && !this.utils.isPrimitiveInitializer(node.initializer)
      ? context.factory.createBinaryExpression(
          identifier,
          context.factory.createToken(SyntaxKind.QuestionQuestionToken),
          node.initializer,
        )
      : identifier;
  const newVariableStatement = context.factory.createVariableStatement(
    undefined,
    context.factory.createVariableDeclarationList(
      [
        context.factory.createVariableDeclaration(
          node.name,
          'exclamationToken' in node ? node.exclamationToken : undefined,
          node.type,
          initializer,
        ),
      ],
      ts.isVariableDeclarationList(node.parent)
        ? node.parent.flags
        : ts.NodeFlags.Let,
    ),
  );

  return context.factory.updateBlock(
    block,
    context.factory.createNodeArray([
      newVariableStatement,
      ...block.statements,
    ]),
  );
}

export function isCallOf(
  this: Transpiler,
  node: ts.Node,
  path: string,
): boolean {
  if (!ts.isCallExpression(node) || !path) return false;

  const pathParts = path.split('.');
  let expression = node.expression;

  for (let i = pathParts.length - 1; i >= 0; i--) {
    const part = pathParts[i];
    if (ts.isIdentifier(expression)) {
      if (part !== '*' && part !== expression.text) return false;
    } else if (ts.isPropertyAccessExpression(expression)) {
      if (part !== '*' && part !== expression.name.text) return false;
      expression = expression.expression;
    } else {
      return false;
    }
  }
  return true;
}
