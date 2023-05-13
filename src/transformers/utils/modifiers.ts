import type ts from 'typescript';
import { SyntaxKind } from 'typescript';
import { sortBy } from 'lodash';
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

export function isAbstract(this: Transformer, node: ts.HasModifiers): boolean {
  return !!node.modifiers?.some((m) => m.kind === SyntaxKind.AbstractKeyword);
}

export function getDeclarationKeyword(
  this: Transformer,
  node: ts.HasModifiers,
): string {
  return this.utils.isReadonly(node) ? 'final' : 'var';
}

const MODIFIERS_PRIORITY: Partial<Record<SyntaxKind, number>> = {
  [SyntaxKind.AsyncKeyword]: 0,
};

export function joinModifiers(
  this: Transformer,
  modifiers: ts.NodeArray<ts.ModifierLike> | undefined,
  context: VisitNodeContext,
): string {
  if (!modifiers) return '';

  return sortBy(modifiers, (m) => MODIFIERS_PRIORITY[m.kind] ?? 999)
    .map((m) => this.visitNode(m, context) + ' ')
    .join('');
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
