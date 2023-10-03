import type ts from 'typescript';
import { SyntaxKind } from 'typescript';
import { sortBy } from 'lodash';
import { type VisitNodeContext, type Transpiler } from '../Transpiler';

export function getAccessModifier(
  this: Transpiler,
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
  this: Transpiler,
  node: ts.HasModifiers,
): string {
  const modifier = this.utils.getAccessModifier(node);
  return !modifier || modifier.kind === SyntaxKind.PublicKeyword
    ? 'public'
    : 'private';
}

export function isReadonly(this: Transpiler, node: ts.HasModifiers): boolean {
  return !!node.modifiers?.some((m) => m.kind === SyntaxKind.ReadonlyKeyword);
}

export function isAbstract(this: Transpiler, node: ts.HasModifiers): boolean {
  return !!node.modifiers?.some((m) => m.kind === SyntaxKind.AbstractKeyword);
}

export function getDeclarationKeyword(
  this: Transpiler,
  node: ts.HasModifiers,
): string {
  return this.utils.isReadonly(node) ? 'final' : 'var';
}

const MODIFIERS_PRIORITY: Partial<Record<SyntaxKind, number>> = {
  [SyntaxKind.AsyncKeyword]: 0,
};
const MODIFIERS_TO_EXCLUDE = new Set([SyntaxKind.DefaultKeyword]);

export function joinModifiers(
  this: Transpiler,
  modifiers: ts.NodeArray<ts.ModifierLike> | ts.ModifierLike[] | undefined,
  context: VisitNodeContext,
): string {
  if (!modifiers) return '';

  return sortBy(
    modifiers.filter((m) => !MODIFIERS_TO_EXCLUDE.has(m.kind)),
    (m) => MODIFIERS_PRIORITY[m.kind] ?? 999,
  )
    .map((m) => this.emitNode(m, context) + ' ')
    .join('');
}
