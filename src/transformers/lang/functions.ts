import ts from 'typescript';
import { type Transpiler, type EmitFn } from '../Transpiler';
import { logger } from '../../Logger';

export const transformArrowFunction: EmitFn = function (
  this: Transpiler,
  node,
  context,
) {
  if (!ts.isArrowFunction(node)) return;
  // Arrow function without { } (inline body) behaves the same in Haxe
  // unless it carries type parameters or a return type annotation
  if (!ts.isBlock(node.body) && !node.typeParameters?.length && !node.type) {
    return;
  }

  const modifiers = this.utils.joinModifiers(node.modifiers, context);
  let typeParams = this.utils.joinTypeParameters(node.typeParameters, context);
  if (typeParams) {
    logger.warn(
      `Arrow function cannot have type parameters in Haxe at`,
      this.utils.getNodeSourcePath(node),
    );
    // references to the dropped type parameters resolve to
    // their constraints (or Any)
    for (const typeParameter of node.typeParameters!) {
      this.utils.renameSymbolTo(
        typeParameter.name,
        typeParameter.constraint
          ? this.emitNode(typeParameter.constraint, context).trim()
          : 'Any',
      );
    }
    typeParams = this.utils.createComment(
      ({ todo }) => `${todo} ${typeParams}`,
    );
  }
  const params = this.utils.joinNodes(node.parameters, context);
  const returnType = node.type
    ? `: ${this.emitNode(node.type, context).trim()}`
    : '';
  const body = ts.isBlock(node.body)
    ? this.emitNode(node.body, context)
    : ` { return ${this.emitNode(node.body, context).trim()}; }`;

  return `${modifiers}function ${typeParams}(${params})${returnType}${body}`;
};

export const transformNewExpression: EmitFn = function (
  this: Transpiler,
  node,
  context,
) {
  // new getClass()() — Haxe `new` only works with a type path
  if (!ts.isNewExpression(node)) return;

  if (
    ts.isIdentifier(node.expression) ||
    ts.isPropertyAccessExpression(node.expression)
  ) {
    // `new` on identifiers is fine unless they hold a class VALUE
    // (a variable) rather than being a class declaration
    if (node.expression.pos === -1) return;
    const symbol = this.utils.getRootSymbol(
      ts.isIdentifier(node.expression) ? node.expression : node.expression.name,
    );
    const isClassLikeSymbol =
      !symbol ||
      !!(
        symbol.flags &
        (ts.SymbolFlags.Class | ts.SymbolFlags.Interface | ts.SymbolFlags.Alias)
      );
    if (isClassLikeSymbol) return;
  }

  return `Type.createInstance(${this.emitNode(
    node.expression,
    context,
  ).trim()}, [${this.utils.joinNodes(node.arguments, context)}])`;
};

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
            'Non-array type annotations of rest parameter is not supported',
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
  let args = this.utils.joinNodes(node.arguments, context);

  // Haxe only allows spreading into the trailing rest argument —
  // f(...a, b) / f(...a, ...b) become a single spread of concatenated arrays
  const spreadArguments = node.arguments.filter(ts.isSpreadElement);
  if (
    spreadArguments.length > 1 ||
    (spreadArguments.length === 1 &&
      !ts.isSpreadElement(node.arguments[node.arguments.length - 1]))
  ) {
    const segments: string[] = [];
    let pending: string[] = [];
    for (const argument of node.arguments) {
      if (ts.isSpreadElement(argument)) {
        if (pending.length) {
          segments.push(`[${pending.join(', ')}]`);
          pending = [];
        }
        segments.push(
          this.utils.visitParenthesized(argument.expression, context),
        );
      } else {
        pending.push(this.emitNode(argument, context).trim());
      }
    }
    if (pending.length) segments.push(`[${pending.join(', ')}]`);

    args = `...${segments[0]}${segments
      .slice(1)
      .map((segment) => `.concat(${segment})`)
      .join('')}`;
  }

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
