import ts from 'typescript';
import { type TransformerFn, type Transpiler } from '../Transpiler';

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

    let newBody = this.utils.ensureNodeIsBlock(node.body, context);
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
        parameter.questionToken,
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
