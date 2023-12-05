import ts from 'typescript';
import { type TransformerFn, type Transpiler } from '../Transpiler';
import { groupBy } from 'lodash';

export const addDefaultPublicModifier: TransformerFn = function (
  this: Transpiler,
  node,
  context,
  parentNode,
) {
  if (
    !ts.canHaveModifiers(node) ||
    !ts.isClassLike(parentNode) ||
    this.utils.getAccessModifier(node)
  ) {
    return;
  }

  const { true: decorators = [], false: modifiers = [] } = groupBy(
    node.modifiers,
    ts.isDecorator,
  );

  const newModifiers: ts.ModifierLike[] = decorators
    .concat(context.factory.createModifier(ts.SyntaxKind.PublicKeyword))
    .concat(modifiers);

  if (ts.isPropertyDeclaration(node)) {
    return context.factory.updatePropertyDeclaration(
      node,
      newModifiers,
      node.name,
      node.questionToken ?? node.exclamationToken,
      node.type,
      node.initializer,
    );
  }

  if (ts.isGetAccessorDeclaration(node)) {
    return context.factory.updateGetAccessorDeclaration(
      node,
      newModifiers,
      node.name,
      node.parameters,
      node.type,
      node.body,
    );
  }

  if (ts.isSetAccessorDeclaration(node)) {
    return context.factory.updateSetAccessorDeclaration(
      node,
      newModifiers,
      node.name,
      node.parameters,
      node.body,
    );
  }

  if (ts.isConstructorDeclaration(node)) {
    return context.factory.updateConstructorDeclaration(
      node,
      newModifiers,
      node.parameters,
      node.body,
    );
  }

  if (ts.isMethodDeclaration(node)) {
    return context.factory.updateMethodDeclaration(
      node,
      newModifiers,
      node.asteriskToken,
      node.name,
      node.questionToken,
      node.typeParameters,
      node.parameters,
      node.type,
      node.body,
    );
  }
};
