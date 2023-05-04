import ts from 'typescript';
import { type Transformer, type TransformerFn } from '../Transformer';

export const transformForLoop: TransformerFn = function (
  this: Transformer,
  node,
  context,
) {
  // for (;;)
  if (!ts.isForStatement(node)) return;

  const declarations = node.initializer
    ? `${this.visitNode(node.initializer, context)};\n`
    : '';
  const indent = node.initializer ? this.utils.getIndent(node) : '';

  const condition = node.condition
    ? this.utils.toExplicitBooleanCondition(node.condition) ?? ''
    : 'true';

  const body = ts.isBlock(node.statement)
    ? node.statement.statements.map((s) => this.visitNode(s, context)).join('')
    : this.visitNode(node.statement, context);

  const increments = node.incrementor
    ? `${this.utils.toSeparateStatements(node.incrementor, context)}`
    : '';

  return `${declarations}${indent}while(${condition}) {${body}\n${increments}${this.utils.getIndent(
    node,
  )}}`;
};

export const transformForOfLoop: TransformerFn = function (
  this: Transformer,
  node,
  context,
) {
  // for (const var of arr)
  if (!ts.isForOfStatement(node)) return;

  const initializer = ts.isVariableDeclarationList(node.initializer)
    ? this.visitNode(node.initializer.declarations[0], context)
    : this.visitNode(node.initializer, context);
  const expression = this.visitNode(node.expression, context);
  const body = this.visitNode(node.statement, context);

  return `for (${initializer} in ${expression}) ${body}`;
};

export const transformForInLoop: TransformerFn = function (
  this: Transformer,
  node,
  context,
) {
  // for (const var in obj)
  if (!ts.isForInStatement(node)) return;

  const initializer = ts.isVariableDeclarationList(node.initializer)
    ? this.visitNode(node.initializer.declarations[0], context)
    : this.visitNode(node.initializer, context);
  const expression = this.visitNode(node.expression, context);
  const body = this.visitNode(node.statement, context);

  return `for (${initializer} in Reflect.fields(${expression})) ${body}`;
};
