import ts from 'typescript';
import { type Transpiler } from '../Transpiler';

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
      base.parent.flags || 2,
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
