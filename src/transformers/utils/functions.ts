import ts from 'typescript';
import { type Transpiler } from '../Transpiler';

export function isAcceptableParameterDeclarationForHx(
  this: Transpiler,
  parameter: ts.ParameterDeclaration,
): boolean {
  return (
    ts.isIdentifier(parameter.name) &&
    (!parameter.initializer || this.utils.isSimpleType(parameter.initializer))
  );
}

export function moveVariableOrParameterDeclarationToBlock(
  this: Transpiler,
  base: ts.VariableDeclaration | ts.ParameterDeclaration,
  identifier: ts.Identifier,
  block: ts.Block,
  context: ts.TransformationContext,
): ts.Block {
  const initializer =
    base.initializer && !this.utils.isSimpleType(base.initializer)
      ? context.factory.createBinaryExpression(
          identifier,
          context.factory.createToken(ts.SyntaxKind.QuestionQuestionToken),
          base.initializer,
        )
      : identifier;
  const newVariableStatement = context.factory.createVariableStatement(
    undefined,
    context.factory.createVariableDeclarationList(
      [
        context.factory.createVariableDeclaration(
          base.name,
          'exclamationToken' in base ? base.exclamationToken : undefined,
          base.type,
          initializer,
        ),
      ],
      ts.isVariableDeclarationList(base.parent)
        ? base.parent.flags
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
