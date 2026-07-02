import ts from 'typescript';
import { type TransformerFn, type Transpiler } from '../Transpiler';

/**
 * TS allows a function literal to declare fewer parameters than its
 * contextual type — Haxe requires the exact arity:
 * const fn: (a: string, b: number) => void = (a) => {};
 * ==> = (a, _b) => {};
 */
export const transformFunctionArity: TransformerFn = function (
  this: Transpiler,
  node,
  context,
) {
  if (!ts.isArrowFunction(node) && !ts.isFunctionExpression(node)) return;
  if (node.pos === -1) return;
  if (node.parameters.some((parameter) => parameter.dotDotDotToken)) return;

  let expectedType: ts.Type | undefined;
  try {
    expectedType = this.typeChecker.getContextualType(node);
  } catch {
    return;
  }
  if (!expectedType) return;
  const signatures = expectedType.getNonNullableType().getCallSignatures();
  if (signatures.length !== 1) return;
  // signatures declared in node_modules describe JS callbacks
  // (forEach, map, …) whose extra parameters are never enforced
  const signatureDeclaration = signatures[0].getDeclaration();
  if (
    !signatureDeclaration ||
    /[\\/]node_modules[\\/]/.test(signatureDeclaration.getSourceFile().fileName)
  ) {
    return;
  }
  const expectedParameters = signatures[0].getParameters();
  if (expectedParameters.length <= node.parameters.length) return;

  const parameters = [
    ...node.parameters,
    ...expectedParameters
      .slice(node.parameters.length)
      .map((parameter) =>
        context.factory.createParameterDeclaration(
          undefined,
          undefined,
          `_${parameter.name}`,
          undefined,
          undefined,
          undefined,
        ),
      ),
  ];

  if (ts.isArrowFunction(node)) {
    return context.factory.updateArrowFunction(
      node,
      node.modifiers,
      node.typeParameters,
      parameters,
      node.type,
      node.equalsGreaterThanToken,
      node.body,
    );
  }
  return context.factory.updateFunctionExpression(
    node,
    node.modifiers,
    node.asteriskToken,
    node.name,
    node.typeParameters,
    parameters,
    node.type,
    node.body,
  );
};

/**
 * Function expressions cannot have type parameters in Haxe,
 * but module-level functions can:
 * export const foo = <T>(x: T) => x; ==> export function foo<T>(x: T) { return x; }
 */
export const transformGenericArrowFunctionDeclaration: TransformerFn =
  function (this: Transpiler, node, context, parentNode) {
    if (!ts.isVariableStatement(node)) return;
    if (!parentNode || !ts.isSourceFile(parentNode)) return;
    if (node.declarationList.declarations.length !== 1) return;

    const [declaration] = node.declarationList.declarations;
    if (!declaration.initializer || !ts.isIdentifier(declaration.name)) return;
    const fn = declaration.initializer;
    if (!ts.isArrowFunction(fn) && !ts.isFunctionExpression(fn)) return;
    if (!fn.typeParameters?.length) return;

    return context.factory.createFunctionDeclaration(
      node.modifiers,
      undefined,
      declaration.name,
      fn.typeParameters,
      fn.parameters,
      fn.type,
      this.utils.ensureNodeIsBlock(fn.body, context, fn),
    );
  };

export const transformDestructuredParameterDeclaration: TransformerFn =
  function (this: Transpiler, node, context) {
    if (
      !ts.isFunctionLike(node) ||
      ts.isTypeNode(node) ||
      !('body' in node) ||
      !node.body ||
      node.parameters.every(this.utils.isAcceptableParameterDeclarationForHx)
    ) {
      return;
    }

    let newBody = this.utils.ensureNodeIsBlock(node.body, context, node);
    const parametersToMove: Array<{
      newName: ts.Identifier;
      node: ts.ParameterDeclaration;
    }> = [];

    const newParameters = node.parameters.map((parameter) => {
      if (this.utils.isAcceptableParameterDeclarationForHx(parameter)) {
        return parameter;
      }

      const newParameterName = context.factory.createUniqueName('param');
      parametersToMove.unshift({
        newName: newParameterName,
        node: parameter,
      });

      return context.factory.updateParameterDeclaration(
        parameter,
        parameter.modifiers,
        undefined,
        newParameterName,
        // a dropped default value made the parameter optional —
        // callers may still omit it
        parameter.questionToken ??
          (parameter.initializer
            ? context.factory.createToken(ts.SyntaxKind.QuestionToken)
            : undefined),
        parameter.type,
        undefined,
      );
    });

    parametersToMove.forEach(({ newName, node }) => {
      newBody = this.utils.moveVariableOrParameterDeclarationToBlock(
        node,
        newName,
        newBody,
        context,
      );
    });

    // const foo = ({ bar }) => bar;
    if (ts.isArrowFunction(node)) {
      return context.factory.updateArrowFunction(
        node,
        node.modifiers,
        node.typeParameters,
        newParameters,
        node.type,
        node.equalsGreaterThanToken,
        newBody,
      );
    }

    // function foo({ bar }) {}
    if (ts.isFunctionDeclaration(node)) {
      return context.factory.updateFunctionDeclaration(
        node,
        node.modifiers,
        node.asteriskToken,
        node.name,
        node.typeParameters,
        newParameters,
        node.type,
        newBody,
      );
    }

    // class Foo { set bar({ baz }) {} }
    if (ts.isSetAccessor(node)) {
      return context.factory.updateSetAccessorDeclaration(
        node,
        node.modifiers,
        node.name,
        newParameters,
        newBody,
      );
    }

    // class Foo { constructor({ bar }) {} }
    if (ts.isConstructorDeclaration(node)) {
      return context.factory.updateConstructorDeclaration(
        node,
        node.modifiers,
        newParameters,
        newBody,
      );
    }

    // class Foo { foo({ bar }) {} }
    if (ts.isMethodDeclaration(node)) {
      return context.factory.updateMethodDeclaration(
        node,
        node.modifiers,
        node.asteriskToken,
        node.name,
        node.questionToken,
        node.typeParameters,
        newParameters,
        node.type,
        newBody,
      );
    }

    // const foo = function({ bar }) {}
    if (ts.isFunctionExpression(node)) {
      return context.factory.updateFunctionExpression(
        node,
        node.modifiers,
        node.asteriskToken,
        node.name,
        node.typeParameters,
        newParameters,
        node.type,
        newBody,
      );
    }
  };
