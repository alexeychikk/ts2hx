import ts from 'typescript';
import { type Transformer, type TransformerFn } from '../Transformer';
import { logger } from '../../Logger';

export const transformArrowFunction: TransformerFn = function (
  this: Transformer,
  node,
  context,
) {
  if (!ts.isArrowFunction(node)) return;
  // Arrow function without { } (inline body) behaves the same in Haxe
  if (!ts.isBlock(node.body)) return;

  const modifiers = this.utils.joinModifiers(node.modifiers, context);
  let typeParams = this.utils.joinTypeParameters(node.typeParameters, context);
  if (typeParams) {
    logger.warn(
      `Arrow function cannot have type parameters in Haxe at`,
      this.utils.getNodeSourcePath(node),
    );
    typeParams = this.utils.createComment(
      ({ todo }) => `${todo} ${typeParams}`,
    );
  }
  const params = this.utils.joinNodes(node.parameters, context);
  const returnType = node.type ? `: ${this.visitNode(node.type, context)}` : '';
  const body = this.visitNode(node.body, context);

  return `${modifiers}function ${typeParams}(${params})${returnType}${body}`;
};

export const transformFunctionParameter: TransformerFn = function (
  this: Transformer,
  node,
  context,
) {
  if (!ts.isParameter(node)) return;

  const name = node.name.getText();
  const dotDotDotToken = node.dotDotDotToken ? '...' : '';

  let type = '';
  if (node.type) {
    if (dotDotDotToken) {
      type = this.visitNode(this.utils.getArrayTypeNode(node.type), context);
    } else {
      type = this.visitNode(node.type, context);
    }
    type = `: ${type}`;
  } else if (context.enforceParameterType) {
    type = `: ${this.utils.getNodeTypeString(node, context)}`;
  }

  const initializer =
    node.initializer && !context.skipParameterInitializer
      ? ` = ${this.visitNode(node.initializer, context)}`
      : '';
  const questionToken = node.questionToken ? `?` : '';

  return `${dotDotDotToken}${questionToken}${name}${type}${initializer}`;
};
