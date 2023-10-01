import ts from 'typescript';
import { type TransformerFn, type Transpiler } from '../Transpiler';

export const transformDestructuredVariableDeclarationInForOf: TransformerFn =
  function (this: Transpiler, node, context) {
    // for (const { foo, bar } of fooBars) {} ->
    // for (const fooBarsItem of fooBars) { const { foo, bar } = fooBarsItem; }
    if (
      !ts.isForOfStatement(node) ||
      !ts.isVariableDeclarationList(node.initializer) ||
      !ts.isVariableDeclaration(node.initializer.declarations[0]) ||
      ts.isIdentifier(node.initializer.declarations[0].name)
    ) {
      return;
    }

    const [variableDeclaration] = node.initializer.declarations;
    if (
      !ts.isVariableDeclaration(variableDeclaration) ||
      ts.isIdentifier(variableDeclaration.name)
    ) {
      return;
    }
    const generatedIdentifier = context.factory.createUniqueName('element');

    return context.factory.updateForOfStatement(
      node,
      node.awaitModifier,
      context.factory.updateVariableDeclarationList(node.initializer, [
        context.factory.updateVariableDeclaration(
          variableDeclaration,
          generatedIdentifier,
          variableDeclaration.exclamationToken,
          variableDeclaration.type,
          variableDeclaration.initializer,
        ),
      ]),
      node.expression,
      this.utils.moveVariableOrParameterDeclarationToBlock(
        variableDeclaration,
        generatedIdentifier,
        this.utils.ensureNodeIsBlock(node.statement, context),
        context,
      ),
    );
  };

export const transformDestructuredVariableDeclarationInCatch: TransformerFn =
  function (this: Transpiler, node, context) {
    // try {} catch ({ message }) {} ->
    // try {} catch (error) { const { message } = error; }
    if (
      !ts.isCatchClause(node) ||
      !node.variableDeclaration ||
      ts.isIdentifier(node.variableDeclaration)
    ) {
      return;
    }

    const generatedIdentifier = context.factory.createUniqueName('error');

    return context.factory.updateCatchClause(
      node,
      context.factory.updateVariableDeclaration(
        node.variableDeclaration,
        generatedIdentifier,
        node.variableDeclaration.exclamationToken,
        node.variableDeclaration.type,
        node.variableDeclaration.initializer,
      ),
      this.utils.moveVariableOrParameterDeclarationToBlock(
        node.variableDeclaration,
        generatedIdentifier,
        node.block,
        context,
      ),
    );
  };
