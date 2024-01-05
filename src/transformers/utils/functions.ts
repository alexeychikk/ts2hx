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
