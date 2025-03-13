import ts from 'typescript';
import { type TransformerFn, type Transpiler } from '../Transpiler';

/**
 * Transforms async function declarations to add @:async metadata in Haxe
 */
export const transformAsyncFunction: TransformerFn = function (
  this: Transpiler,
  node,
  context,
) {
  if (!this.flags.transformAsyncAwait || !ts.isFunctionDeclaration(node))
    return;

  if (!node.modifiers?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword))
    return;

  // We'll handle the metadata directly in the language transforms
  // This just marks the node to be transformed

  // Keep the original function declaration structure but remove the async keyword
  return context.factory.updateFunctionDeclaration(
    node,
    node.modifiers?.filter((m) => m.kind !== ts.SyntaxKind.AsyncKeyword),
    node.asteriskToken,
    node.name,
    node.typeParameters,
    node.parameters,
    node.type,
    node.body
  );
};

/**
 * Transforms async method declarations to add @:async metadata in Haxe
 */
export const transformAsyncMethod: TransformerFn = function (
  this: Transpiler,
  node,
  context,
) {
  if (!this.flags.transformAsyncAwait || !ts.isMethodDeclaration(node)) return;

  if (!node.modifiers?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword))
    return;

  // Add the @:async metadata to the Haxe output
  this.utils.addNodeMetadata(node, '@:async');

  // Keep the original method declaration structure but remove the async keyword
  return context.factory.updateMethodDeclaration(
    node,
    node.modifiers?.filter((m) => m.kind !== ts.SyntaxKind.AsyncKeyword),
    node.asteriskToken,
    node.name,
    node.questionToken,
    node.typeParameters,
    node.parameters,
    node.type,
    node.body
  );
};

/**
 * Transforms async arrow functions to add @:async metadata in Haxe
 */
export const transformAsyncArrowFunction: TransformerFn = function (
  this: Transpiler,
  node,
  context,
) {
  if (!this.flags.transformAsyncAwait || !ts.isArrowFunction(node)) return;

  if (!node.modifiers?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword))
    return;

  // Add the @:async metadata to the Haxe output
  this.utils.addNodeMetadata(node, '@:async');

  // Keep the original arrow function structure but remove the async keyword
  return context.factory.updateArrowFunction(
    node,
    node.modifiers?.filter((m) => m.kind !== ts.SyntaxKind.AsyncKeyword),
    node.typeParameters,
    node.parameters,
    node.type,
    node.equalsGreaterThanToken,
    node.body
  );
};

/**
 * Transforms async function expressions to add @:async metadata in Haxe
 */
export const transformAsyncFunctionExpression: TransformerFn = function (
  this: Transpiler,
  node,
  context,
) {
  if (!this.flags.transformAsyncAwait || !ts.isFunctionExpression(node)) return;

  if (!node.modifiers?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword))
    return;

  // Add the @:async metadata to the Haxe output
  this.utils.addNodeMetadata(node, '@:async');

  // Keep the original function expression structure but remove the async keyword
  return context.factory.updateFunctionExpression(
    node,
    node.modifiers?.filter((m) => m.kind !== ts.SyntaxKind.AsyncKeyword),
    node.asteriskToken,
    node.name,
    node.typeParameters,
    node.parameters,
    node.type,
    node.body
  );
};

/**
 * Transforms await expressions to add @:await metadata in Haxe
 */
export const transformAwaitExpression: TransformerFn = function (
  this: Transpiler,
  node,
  context,
) {
  if (!this.flags.transformAsyncAwait || !ts.isAwaitExpression(node)) return;

  // Add the @:await metadata to the Haxe output for the awaited expression
  this.utils.addNodeMetadata(node.expression, '@:await');

  // Return the expression with @:await metadata
  return node.expression;
};

/**
 * Transforms promise chain expressions (.then().catch()) to equivalent Haxe code
 */
export const transformPromiseChain: TransformerFn = function (
  this: Transpiler,
  node,
  context,
) {
  if (!this.flags.transformAsyncAwait || !ts.isCallExpression(node)) return;
  
  // Check if it's a .then() or .catch() call on a promise
  if (!ts.isPropertyAccessExpression(node.expression)) return;
  
  const propertyName = node.expression.name.text;
  
  if (propertyName !== 'then' && propertyName !== 'catch') return;

  // In Haxe we can continue to use promise methods directly
  return node;
};
