import ts, { SyntaxKind } from 'typescript';
import { TsUtils } from '../../TsUtils';
import { type Transformer, type TransformerFn } from '../Transformer';

export const transformClassDeclaration: TransformerFn = function (
  this: Transformer,
  node,
  context,
) {
  if (!ts.isClassDeclaration(node)) return;

  const modifiers =
    node.modifiers?.map((m) => this.visitNode(m, context) + ' ').join('') ?? '';
  const className =
    node.name?.getText() ??
    `AnonymousClass_${this.context.anonymousClassCounter++}`;
  const typeParams = node.typeParameters
    ?.map((tp) => this.visitNode(tp, context))
    .join(', ');
  const defaultConstructor = node.members.find((m) =>
    ts.isConstructorDeclaration(m),
  )
    ? ''
    : `\n${TsUtils.getIndent(node)}  public function new() {}\n`;

  return (
    `${modifiers}class ${className}${typeParams ? `<${typeParams}>` : ''} {` +
    defaultConstructor +
    node.members.map((m) => this.visitNode(m, context)).join('') +
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

  // in Haxe class members are private by default unlike in TS
  const defaultAccessModifier = TsUtils.getAccessModifier(node)
    ? ''
    : 'public ';
  const modifiers =
    node.modifiers?.map((m) => this.visitNode(m, context) + ' ').join('') ?? '';

  let type = this.visitNode(node.type, context);
  if (type.trim()) {
    if (node.questionToken) type = `Null<${type}>`;
    type = `: ${type}`;
  }

  let initializer = this.visitNode(node.initializer, context);
  if (initializer.trim()) {
    initializer = ` = ${initializer}`;
  }

  return `${defaultAccessModifier}${modifiers}var ${node.name.getText()}${type}${initializer};`;
};
