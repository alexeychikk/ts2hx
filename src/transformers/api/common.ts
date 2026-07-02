import ts from 'typescript';
import { type Transpiler, type EmitFn } from '../Transpiler';

export const transformJsApiAccess: EmitFn = function (this: Transpiler, node) {
  if (!ts.isPropertyAccessExpression(node)) return;

  const code: string | undefined = (() => {
    switch (node.getText()) {
      case 'console.log':
      case 'console.info':
      case 'console.warn':
      case 'console.error':
      case 'console.debug':
        return 'trace';
      case 'Object.keys':
        return 'Reflect.fields';
      case 'Object.values':
        return 'Ts2hx.objectValues';
      case 'Object.entries':
        return 'Ts2hx.objectEntries';
      case 'Object.assign':
        return 'Ts2hx.objectAssign';
      case 'Object.fromEntries':
        return 'Ts2hx.objectFromEntries';
      case 'Object.getOwnPropertyNames':
        return 'js.lib.Object.getOwnPropertyNames';
      case 'Object.getPrototypeOf':
        return 'js.lib.Object.getPrototypeOf';
      case 'Date.now':
        return 'Ts2hx.dateNow';
      case 'Array.from':
        return 'Ts2hx.arrayFrom';
      case 'Array.isArray':
        return 'Ts2hx.isArray';
      case 'JSON.stringify':
        return 'haxe.Json.stringify';
      case 'JSON.parse':
        return 'haxe.Json.parse';
    }
  })();

  if (code === undefined || !this.utils.isBuiltInNode(node.expression)) return;
  return code;
};

export const transformJsIdentifiers: EmitFn = function (
  this: Transpiler,
  node,
) {
  if (!ts.isIdentifier(node)) return;

  // match by text first to skip heavy type checking if possible
  const code: string | undefined = (() => {
    switch (node.getText()) {
      case 'Error':
        this.imports.exception = true;
        return 'Exception';
      case 'RegExp':
        return 'EReg';
      case 'Object':
        return 'js.lib.Object';
    }
  })();

  if (code === undefined || !this.utils.isBuiltInNode(node)) return;

  return code;
};

/** obj.constructor ==> Type.getClass(obj) */
export const transformConstructorAccess: EmitFn = function (
  this: Transpiler,
  node,
  context,
) {
  if (!ts.isPropertyAccessExpression(node)) return;
  if (node.name.text !== 'constructor') return;

  return `Type.getClass(${this.emitNode(node.expression, context).trim()})`;
};

/** arr.slice() ==> arr.slice(0) — Haxe slice has no zero-argument form */
export const transformSliceWithoutArguments: EmitFn = function (
  this: Transpiler,
  node,
  context,
) {
  if (!ts.isCallExpression(node)) return;
  if (!ts.isPropertyAccessExpression(node.expression)) return;
  if (node.expression.name.text !== 'slice') return;
  if (node.arguments.length > 0) return;

  return `${this.emitNode(
    node.expression.expression,
    context,
  ).trim()}.slice(0)`;
};

/**
 * new Date() ==> Date.now()
 * new Date(millis) ==> Date.fromTime(millis)
 */
export const transformDateConstruction: EmitFn = function (
  this: Transpiler,
  node,
  context,
) {
  if (!ts.isNewExpression(node)) return;
  if (!ts.isIdentifier(node.expression)) return;
  if (node.expression.text !== 'Date') return;
  if ((node.arguments?.length ?? 0) > 1) return;
  if (!this.utils.isBuiltInNode(node.expression)) return;

  return node.arguments?.length
    ? `Date.fromTime(${this.emitNode(node.arguments[0], context).trim()})`
    : 'Date.now()';
};

/**
 * Haxe closures are always bound, so:
 * this.foo = this.foo.bind(this); ==> (removed)
 * expr.bind(this) ==> expr
 */
export const transformBindThis: EmitFn = function (
  this: Transpiler,
  node,
  context,
) {
  const isBindThisCall = (expr: ts.Node): expr is ts.CallExpression =>
    ts.isCallExpression(expr) &&
    ts.isPropertyAccessExpression(expr.expression) &&
    expr.expression.name.text === 'bind' &&
    expr.arguments.length === 1 &&
    expr.arguments[0].kind === ts.SyntaxKind.ThisKeyword;

  // this.foo = this.foo.bind(this); — Haxe forbids rebinding methods
  if (
    ts.isExpressionStatement(node) &&
    ts.isBinaryExpression(node.expression) &&
    node.expression.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
    isBindThisCall(node.expression.right) &&
    (
      node.expression.right.expression as ts.PropertyAccessExpression
    ).expression.getText() === node.expression.left.getText()
  ) {
    return this.utils.createComment(
      () => `${node.getText()} is redundant in Haxe`,
    );
  }

  if (isBindThisCall(node)) {
    return this.emitNode(
      (node.expression as ts.PropertyAccessExpression).expression,
      context,
    );
  }
};

/** promise.catch(handler) ==> promise.catchError(handler) */
export const transformPromiseCatch: EmitFn = function (
  this: Transpiler,
  node,
  context,
) {
  if (!ts.isPropertyAccessExpression(node)) return;
  if (node.name.text !== 'catch') return;

  // 'catch' is a Haxe keyword, so any method with this name must be renamed;
  // Promises (the common case) provide catchError in js.lib.Promise
  return `${this.emitNode(node.expression, context).trim()}.catchError`;
};

/** obj.hasOwnProperty(key) ==> Reflect.hasField(obj, key) */
export const transformHasOwnProperty: EmitFn = function (
  this: Transpiler,
  node,
  context,
) {
  if (!ts.isCallExpression(node)) return;
  if (!ts.isPropertyAccessExpression(node.expression)) return;
  if (node.expression.name.text !== 'hasOwnProperty') return;

  return `Reflect.hasField(${this.emitNode(
    node.expression.expression,
    context,
  ).trim()}, ${this.utils.joinNodes(node.arguments, context)})`;
};

/** Symbol('foo') ==> new Symbol('foo') (js.lib.Symbol) */
export const transformSymbolCall: EmitFn = function (
  this: Transpiler,
  node,
  context,
) {
  if (!ts.isCallExpression(node)) return;
  if (!ts.isIdentifier(node.expression)) return;
  if (node.expression.text !== 'Symbol') return;
  if (!this.utils.isBuiltInNode(node.expression)) return;

  return `new Symbol(${this.utils.joinNodes(node.arguments, context)})`;
};

/**
 * Methods of String/RegExp that take or are called on a regex map to the
 * inverted EReg API:
 * str.replace(regex, by) ==> regex.replace(str, by)
 * str.split(regex) ==> regex.split(str)
 * regex.test(str) ==> regex.match(str)
 */
export const transformRegexApi: EmitFn = function (
  this: Transpiler,
  node,
  context,
) {
  if (!ts.isCallExpression(node)) return;
  if (!ts.isPropertyAccessExpression(node.expression)) return;

  const methodName = node.expression.name.text;
  const target = node.expression.expression;

  if (methodName === 'test' && this.utils.isRegExpNode(target)) {
    return `${this.utils.visitParenthesized(
      target,
      context,
    )}.match(${this.utils.joinNodes(node.arguments, context)})`;
  }

  if (
    (methodName === 'replace' || methodName === 'split') &&
    node.arguments.length > 0 &&
    this.utils.isRegExpNode(node.arguments[0])
  ) {
    const args = [
      this.utils.visitParenthesized(target, context),
      ...node.arguments
        .slice(1)
        .map((arg) => this.emitNode(arg, context).trim()),
    ];
    return `${this.utils.visitParenthesized(
      node.arguments[0],
      context,
    )}.${methodName}(${args.join(', ')})`;
  }
};
