import ts from 'typescript';
import { type Transpiler, type EmitFn } from '../Transpiler';

export const transformForLoop: EmitFn = function (
  this: Transpiler,
  node,
  context,
) {
  // for (;;)
  if (!ts.isForStatement(node)) return;

  const declarations = node.initializer
    ? `${this.emitNode(node.initializer, context)};\n`
    : '';
  const indent = node.initializer ? this.utils.getIndent(node) : '';

  const condition = node.condition
    ? this.utils.toExplicitBooleanCondition(node.condition, context)
    : 'true';

  const body = ts.isBlock(node.statement)
    ? node.statement.statements.map((s) => this.emitNode(s, context)).join('')
    : this.emitNode(node.statement, context);

  const increments = node.incrementor
    ? `${this.utils.toSeparateStatements(node.incrementor, context)}`
    : '';

  return `${declarations}${indent}while(${condition}) {${body}\n${increments}${this.utils.getIndent(
    node,
  )}}`;
};

export const transformForOfLoop: EmitFn = function (
  this: Transpiler,
  node,
  context,
) {
  // for (const var of arr)
  if (!ts.isForOfStatement(node)) return;

  const initializer = ts.isVariableDeclarationList(node.initializer)
    ? this.emitNode(node.initializer.declarations[0], context)
    : this.emitNode(node.initializer, context);
  const expression = this.emitNode(node.expression, context);
  const body = this.emitNode(node.statement, context);

  return `for (${initializer} in ${expression}) ${body}`;
};

export const transformForInLoop: EmitFn = function (
  this: Transpiler,
  node,
  context,
) {
  // for (const var in obj)
  if (!ts.isForInStatement(node)) return;

  const initializer = ts.isVariableDeclarationList(node.initializer)
    ? this.emitNode(node.initializer.declarations[0], context)
    : this.emitNode(node.initializer, context);
  const expression = this.emitNode(node.expression, context);
  const body = this.emitNode(node.statement, context);

  return `for (${initializer} in Reflect.fields(${expression})) ${body}`;
};
