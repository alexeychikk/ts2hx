import ts, { SyntaxKind } from 'typescript';
import { logger } from '../../Logger';
import { type Transpiler, type EmitFn } from '../Transpiler';

export const transformObjectLiteralExpression: EmitFn = function (
  this: Transpiler,
  node,
  context,
) {
  if (!ts.isObjectLiteralExpression(node)) return;
  if (!node.properties.some((prop) => ts.isSpreadAssignment(prop))) return;

  // property kinds that emit only a comment (see transformPropertyAssignment
  // and transformGetSet) and thus must not be joined with commas
  const isCommentedOut = (prop: ts.ObjectLiteralElementLike): boolean =>
    (ts.isPropertyAssignment(prop) && ts.isComputedPropertyName(prop.name)) ||
    ts.isGetAccessor(prop) ||
    ts.isSetAccessor(prop);

  // split into spreads and groups of consecutive regular properties
  const parts: Array<ts.SpreadAssignment | ts.ObjectLiteralElementLike[]> = [];
  for (const prop of node.properties) {
    if (ts.isSpreadAssignment(prop)) {
      parts.push(prop);
      continue;
    }
    const lastPart = parts[parts.length - 1];
    if (Array.isArray(lastPart)) lastPart.push(prop);
    else parts.push([prop]);
  }

  const emitGroup = (
    group: ts.ObjectLiteralElementLike[],
  ): { code: string; hasProperties: boolean } => {
    let code = `{`;
    let needsComma = false;
    let hasProperties = false;
    for (const prop of group) {
      const propCode = this.emitNode(prop, context);
      if (isCommentedOut(prop)) {
        code += propCode;
        continue;
      }
      code += needsComma ? `,${propCode}` : propCode;
      needsComma = true;
      hasProperties = true;
    }
    return { code: code + `}`, hasProperties };
  };

  // groups with nothing but comments cannot start or join the .combine()
  // chain ({}.combine() does not parse) — their comments are kept aside
  let result = '';
  let leadingComments = '';
  const trailingComments: string[] = [];

  for (const part of parts) {
    let code: string;
    if (Array.isArray(part)) {
      const group = emitGroup(part);
      if (!group.hasProperties) {
        const comments = group.code.slice(1, -1);
        if (result) trailingComments.push(comments);
        else leadingComments += comments;
        continue;
      }
      code = group.code;
    } else {
      code = this.emitNode(part.expression, context).trim();
    }
    result = result ? `${result}.combine(${code})` : code;
  }

  return `${leadingComments}${result || '{}'}${trailingComments.join('')}`;
};

export const transformPropertyAssignment: EmitFn = function (
  this: Transpiler,
  node,
  context,
) {
  if (!ts.isPropertyAssignment(node)) return;
  if (!ts.isObjectLiteralExpression(node.parent)) return;
  // { 10: "bar" }
  if (ts.isNumericLiteral(node.name)) {
    return this.utils.replaceChild(
      node,
      context,
      node.name,
      `"${node.name.text}"`,
    );
  }
  // { [myVar]: "bar" }
  if (ts.isComputedPropertyName(node.name)) {
    logger.warn(
      `Computed property name is not supported in object literal at`,
      this.utils.getNodeSourcePath(node.name),
    );

    ignoreSeparatingComma.call(this, node);
    return this.utils.commentOutNode(node);
  }
};

export const transformShorthandPropertyAssignment: EmitFn = function (
  this: Transpiler,
  node,
  context,
) {
  if (!ts.isShorthandPropertyAssignment(node)) return;
  if (!ts.isObjectLiteralExpression(node.parent)) return;
  // { myVar }
  return `${this.utils.toHaxeIdentifier(node.name.text)}:${this.emitNode(
    node.name,
    context,
  )}`;
};

export const transformElementAccess: EmitFn = function (
  this: Transpiler,
  node,
  context,
) {
  // myObj[myKey]
  if (!ts.isElementAccessExpression(node)) return;
  const type = this.typeChecker
    .getTypeAtLocation(node.expression)
    .getNonNullableType();

  if (this.typeChecker.isArrayLikeType(type)) {
    if (!node.questionDotToken) return;
    const expression = this.emitNode(node.expression, context);
    const arg = this.emitNode(node.argumentExpression, context);
    return `(${expression} != null ? ${expression}[${arg}] : null)`;
  }

  if (isObjectLikeType(type)) {
    const expression = this.emitNode(node.expression, context);
    const arg = this.emitNode(node.argumentExpression, context);
    const code = `Reflect.field(${expression}, ${arg})`;
    return node.questionDotToken
      ? `(${expression.trim()} != null ? ${code} : null)`
      : code;
  }
};

const isObjectLikeType = (type: ts.Type): boolean => {
  if (type.flags & ts.TypeFlags.Object) return true;
  return type.isUnion() && type.types.every(isObjectLikeType);
};

const COMPOUND_ASSIGNMENT_OPERATORS: Partial<Record<SyntaxKind, string>> = {
  [SyntaxKind.EqualsToken]: '',
  [SyntaxKind.PlusEqualsToken]: '+',
  [SyntaxKind.MinusEqualsToken]: '-',
  [SyntaxKind.AsteriskEqualsToken]: '*',
  [SyntaxKind.SlashEqualsToken]: '/',
  [SyntaxKind.PercentEqualsToken]: '%',
};

export const transformElementWriteToObject: EmitFn = function (
  this: Transpiler,
  node,
  context,
) {
  // myObj[myKey] = myValue; myObj[myKey] += myValue; ...
  if (!ts.isBinaryExpression(node)) return;
  const operator = COMPOUND_ASSIGNMENT_OPERATORS[node.operatorToken.kind];
  if (operator === undefined) return;
  if (!ts.isElementAccessExpression(node.left)) return;

  const { expression, argumentExpression } = node.left;
  const type = this.typeChecker
    .getTypeAtLocation(expression)
    .getNonNullableType();
  if (this.typeChecker.isArrayLikeType(type)) return;
  if (!isObjectLikeType(type)) return;

  const target = this.emitNode(expression, context).trim();
  const key = this.emitNode(argumentExpression, context).trim();
  const value = this.emitNode(node.right, context).trim();
  const newValue = operator
    ? `Reflect.field(${target}, ${key}) ${operator} ${value}`
    : value;
  return `Reflect.setField(${target}, ${key}, ${newValue})`;
};

export const transformIncrementDecrementOnObject: EmitFn = function (
  this: Transpiler,
  node,
  context,
) {
  // myObj[myKey]++; --myObj[myKey];
  if (!(ts.isPostfixUnaryExpression(node) || ts.isPrefixUnaryExpression(node)))
    return;
  if (
    node.operator !== SyntaxKind.PlusPlusToken &&
    node.operator !== SyntaxKind.MinusMinusToken
  ) {
    return;
  }
  if (!ts.isElementAccessExpression(node.operand)) return;

  const { expression, argumentExpression } = node.operand;
  const type = this.typeChecker
    .getTypeAtLocation(expression)
    .getNonNullableType();
  if (this.typeChecker.isArrayLikeType(type)) return;
  if (!isObjectLikeType(type)) return;

  const operator = node.operator === SyntaxKind.PlusPlusToken ? '+' : '-';
  const target = this.emitNode(expression, context).trim();
  const key = this.emitNode(argumentExpression, context).trim();
  const comment = ts.isExpressionStatement(node.parent)
    ? ''
    : this.utils.createComment(
        ({ todo }) => `${todo} value of '${node.getText()}' is lost`,
      );

  return `${comment}Reflect.setField(${target}, ${key}, Reflect.field(${target}, ${key}) ${operator} 1)`;
};

/**
 * TS allows accessing common members of a union — Haxe's EitherType has
 * no fields, so the access goes through Dynamic:
 * (serverState || clientState).animals ==> (state : Dynamic).animals
 */
export const transformUnionMemberAccess: EmitFn = function (
  this: Transpiler,
  node,
  context,
) {
  if (!ts.isPropertyAccessExpression(node)) return;
  if (node.expression.pos === -1) return;

  let type: ts.Type;
  try {
    type = this.typeChecker
      .getTypeAtLocation(node.expression)
      .getNonNullableType();
  } catch {
    return;
  }
  if (!type.isUnion()) return;
  const parts = type.types.filter(
    (part) => !(part.flags & (ts.TypeFlags.Null | ts.TypeFlags.Undefined)),
  );
  if (parts.length < 2) return;
  if (!parts.every((part) => part.flags & ts.TypeFlags.Object)) return;

  return `(${this.emitNode(node.expression, context).trim()} : Dynamic)${
    node.questionDotToken ? '?.' : '.'
  }${this.utils.toHaxeIdentifier(node.name.text)}`;
};

export const transformGetSet: EmitFn = function (this: Transpiler, node) {
  // { get prop() {}, set prop(value) {} }
  if (!(ts.isGetAccessor(node) || ts.isSetAccessor(node))) return;
  if (!ts.isObjectLiteralExpression(node.parent)) return;

  ignoreSeparatingComma.call(this, node);
  return this.utils.commentOutNode(
    node,
    `Getters and setters on object literals are not supported`,
  );
};

/**
 * A commented-out object literal property must take its separating commas
 * with it: the next one always (it may be a trailing comma), plus the
 * previous one when this is the last property — a comma with no property
 * before or after it is invalid in Haxe.
 */
const ignoreSeparatingComma = function (
  this: Transpiler,
  node: ts.ObjectLiteralElementLike,
): void {
  this.utils.ignoreNextNodeOfKind(node, SyntaxKind.CommaToken);
  const properties = (node.parent as ts.ObjectLiteralExpression).properties;
  if (properties[properties.length - 1] === node) {
    this.utils.ignorePrevNodeOfKind(node, SyntaxKind.CommaToken);
  }
};
