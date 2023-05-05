import type ts from 'typescript';
import { SyntaxKind } from 'typescript';
import { type VisitNodeContext, type Transformer } from '../Transformer';

export function getAccessModifier(
  this: Transformer,
  node: ts.HasModifiers,
): ts.Modifier | undefined {
  return node.modifiers?.find(
    (modifier) =>
      modifier.kind === SyntaxKind.PublicKeyword ||
      modifier.kind === SyntaxKind.ProtectedKeyword ||
      modifier.kind === SyntaxKind.PrivateKeyword,
  ) as ts.Modifier | undefined;
}

export function getAccessModifierString(
  this: Transformer,
  node: ts.HasModifiers,
): string {
  const modifier = this.utils.getAccessModifier(node);
  return !modifier || modifier.kind === SyntaxKind.PublicKeyword
    ? 'public'
    : 'private';
}

export function isReadonly(this: Transformer, node: ts.HasModifiers): boolean {
  return !!node.modifiers?.some((m) => m.kind === SyntaxKind.ReadonlyKeyword);
}

export function getDeclarationKeyword(
  this: Transformer,
  node: ts.HasModifiers,
): string {
  return this.utils.isReadonly(node) ? 'final' : 'var';
}

export function joinModifiers(
  this: Transformer,
  modifiers: ts.NodeArray<ts.ModifierLike> | undefined,
  context: VisitNodeContext,
): string {
  return modifiers?.map((m) => this.visitNode(m, context) + ' ').join('') ?? '';
}

export function joinMemberModifiers(
  this: Transformer,
  node: ts.HasModifiers,
  context: VisitNodeContext,
): string {
  // in Haxe class members are private by default unlike in TS
  const defaultAccessModifier = this.utils.getAccessModifier(node)
    ? ''
    : 'public ';
  const modifiers = this.utils.joinModifiers(node.modifiers, context);
  return `${defaultAccessModifier}${modifiers}`;
}
