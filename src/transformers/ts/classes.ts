import ts from 'typescript';
import { type TransformerFn, type Transpiler } from '../Transpiler';

export const transformClassMembersWithoutAccessModifier: TransformerFn =
  function (this: Transpiler, node, context) {
    if (
      !ts.canHaveModifiers(node) ||
      !ts.isClassLike(this.utils.getParentNode(node)) ||
      this.utils.getAccessModifier(node)
    ) {
      return;
    }

    const newModifiers: ts.ModifierLike[] = [
      context.factory.createModifier(ts.SyntaxKind.PublicKeyword),
    ];

    if (ts.isPropertyDeclaration(node)) {
      return context.factory.updatePropertyDeclaration(
        node,
        newModifiers.concat(node.modifiers ?? []),
        node.name,
        node.questionToken ?? node.exclamationToken,
        node.type,
        node.initializer,
      );
    }

    if (ts.isGetAccessorDeclaration(node)) {
      return context.factory.updateGetAccessorDeclaration(
        node,
        newModifiers.concat(node.modifiers ?? []),
        node.name,
        node.parameters,
        node.type,
        node.body,
      );
    }

    if (ts.isSetAccessorDeclaration(node)) {
      return context.factory.updateSetAccessorDeclaration(
        node,
        newModifiers.concat(node.modifiers ?? []),
        node.name,
        node.parameters,
        node.body,
      );
    }

    if (ts.isConstructorDeclaration(node)) {
      return context.factory.updateConstructorDeclaration(
        node,
        newModifiers.concat(node.modifiers ?? []),
        node.parameters,
        node.body,
      );
    }

    if (ts.isMethodDeclaration(node)) {
      return context.factory.updateMethodDeclaration(
        node,
        newModifiers.concat(node.modifiers ?? []),
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
