import ts, { SyntaxKind } from 'typescript';
import { TsUtils } from '../../TsUtils';
import { type Transformer, type TransformerFn } from '../Transformer';

export const transformClassDeclaration: TransformerFn = function (
  this: Transformer,
  node,
  context,
) {
  if (!ts.isClassDeclaration(node)) return;

  const modifiers = this.joinModifiers(node.modifiers, context);
  const className =
    node.name?.getText() ??
    `AnonymousClass_${this.context.anonymousClassCounter++}`;
  const typeParams = this.joinTypeParameters(node.typeParameters, context);
  const defaultConstructor = node.members.find((m) =>
    ts.isConstructorDeclaration(m),
  )
    ? ''
    : `\n${TsUtils.getIndent(node)}  public function new() {}\n`;
  const inheritance = this.joinNodes(node.heritageClauses, context, ' ');

  return (
    `${modifiers}class ${className}${typeParams} ${inheritance} {` +
    defaultConstructor +
    this.joinNodes(node.members, context, '') +
    `\n${TsUtils.getIndent(node)}}`
  );
};

export const transformHeritageClause: TransformerFn = function (
  this: Transformer,
  node,
  context,
) {
  // extends A, B, C
  if (!ts.isHeritageClause(node)) return;

  const keyword =
    node.token === SyntaxKind.ExtendsKeyword ? 'extends' : 'implements';

  return node.types
    .map((t) => `${keyword} ${this.visitNode(t, context)}`)
    .join(' ');
};

export const transformClassPropertyDeclaration: TransformerFn = function (
  this: Transformer,
  node,
  context,
) {
  // foo?: string = "bar";
  if (!(ts.isPropertyDeclaration(node) && ts.isClassDeclaration(node.parent)))
    return;

  if (ts.isComputedPropertyName(node.name)) {
    return TsUtils.commentOutNode(
      node,
      `Computed property name is not supported in class property declaration at`,
    );
  }

  const modifiers = this.joinMemberModifiers(node, context);

  let type = '';
  if (node.type) {
    type = this.visitNode(node.type, context);
    if (node.questionToken) type = `Null<${type}>`;
    type = `: ${type}`;
  }

  const initializer = node.initializer
    ? `= ${this.visitNode(node.initializer, context)}`
    : '';

  return `${modifiers}var ${node.name.getText()}${type}${initializer};`;
};

export const transformClassMethodDeclaration: TransformerFn = function (
  this: Transformer,
  node,
  context,
) {
  // public static main(): void {}
  if (!(ts.isMethodDeclaration(node) && ts.isClassDeclaration(node.parent)))
    return;

  const modifiers = this.joinMemberModifiers(node, context);
  const typeParams = this.joinTypeParameters(node.typeParameters, context);
  const params = this.joinNodes(node.parameters, context);
  const returnType = node.type ? `: ${this.visitNode(node.type, context)}` : '';
  const body = node.body ? this.visitNode(node.body, context) : ';';

  return `${modifiers}function ${node.name.getText()}${typeParams}(${params})${returnType}${body}`;
};
