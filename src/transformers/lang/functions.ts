import ts from 'typescript';
import { type Transpiler, type EmitFn } from '../Transpiler';
import { logger } from '../../Logger';

export const transformFunctionParameter: EmitFn = function (
  this: Transpiler,
  node,
  context,
) {
  if (!ts.isParameter(node)) return;

  let name = node.name.getText();
  if (name === 'this') {
    name = this.utils.renameSymbol(node.name, '_this');
  }
  const dotDotDotToken = node.dotDotDotToken ? '...' : '';

  let type = '';
  if (node.type) {
    if (dotDotDotToken) {
      const typeNode = this.utils.getArrayTypeNode(node.type);
      type = typeNode
        ? this.emitNode(typeNode, context)
        : this.utils.commentOutNode(
            node.type,
            'Non-array type annotations of rest parameter is not supported at',
          ) + 'Any';
    } else {
      type = this.emitNode(node.type, context);
    }
    type = `: ${type}`;
  } else if (context.enforceParameterType) {
    type = `: ${this.utils.getNodeTypeString(node, context)}`;
  }

  const initializer =
    node.initializer && !context.skipParameterInitializer
      ? ` = ${this.emitNode(node.initializer, context)}`
      : '';
  const questionToken = node.questionToken ? `?` : '';

  return `${dotDotDotToken}${questionToken}${name}${type}${initializer}`;
};

export const transformCallExpression: EmitFn = function (
  this: Transpiler,
  node,
  context,
) {
  if (!ts.isCallExpression(node)) return;

  const expression = this.emitNode(node.expression, context);
  const args = this.utils.joinNodes(node.arguments, context);

  let typeArgs = '';
  if (node.typeArguments) {
    logger.warn(
      `Call expression cannot have type arguments at`,
      this.utils.getNodeSourcePath(node),
    );
    typeArgs = this.utils.createComment(
      ({ todo }) =>
        `${todo} <${this.utils.joinNodes(node.typeArguments, context)}>`,
    );
  }

  const code = `${expression}${typeArgs}(${args})`;
  return node.questionDotToken
    ? this.utils.parenthesizeCode(
        node,
        `${expression} != null ? ${code} : null`,
      )
    : code;
};
