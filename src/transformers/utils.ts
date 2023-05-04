import ts, { SyntaxKind } from 'typescript';
import { logger } from '../Logger';
import { type VisitNodeContext, type Transformer } from './Transformer';

export function getNextNode(
  this: Transformer,
  node: ts.Node,
  parent = this.utils.getDirectParent(node),
): ts.Node | undefined {
  if (!parent) return;
  const nodeIndex = parent.getChildren().findIndex((n) => n === node);
  return parent.getChildAt(nodeIndex + 1);
}

export function getDirectParent(
  this: Transformer,
  node: ts.Node,
): ts.Node | undefined {
  if (!node.parent) return;
  const children = node.parent.getChildren();
  return children.includes(node)
    ? node.parent
    : children.find((ch) => ch.getChildren().includes(node));
}

export function isOperandOfConditionalExpression(
  this: Transformer,
  node: ts.Node,
): boolean {
  return (
    !!node.parent &&
    ts.isConditionalExpression(node.parent) &&
    node.parent.condition === node
  );
}

export function isOperandOfBooleanExpression(
  this: Transformer,
  node: ts.Node,
): boolean {
  return (
    !!node.parent &&
    ts.isBinaryExpression(node.parent) &&
    (node.parent.left === node || node.parent.right === node) &&
    [SyntaxKind.AmpersandAmpersandToken, SyntaxKind.BarBarToken].includes(
      node.parent.operatorToken.kind,
    )
  );
}

export function isBooleanExpressionOfStatement(
  this: Transformer,
  node: ts.Node,
): boolean {
  return (
    !!node.parent &&
    (ts.isIfStatement(node.parent) ||
      ts.isWhileStatement(node.parent) ||
      ts.isDoStatement(node.parent)) &&
    node.parent.expression === node
  );
}

export function getIndent(this: Transformer, node: ts.Node): string {
  const sourceFile = node.getSourceFile();
  const { line } = ts.getLineAndCharacterOfPosition(
    sourceFile,
    node.getStart(),
  );
  const lineText = sourceFile.text.split('\n')[line];
  const indentationLength = lineText.search(/\S/);
  return lineText.slice(0, indentationLength);
}

export function getNodeSourcePath(this: Transformer, node: ts.Node): string {
  const sourceFile = node.getSourceFile();
  const { line, character } = ts.getLineAndCharacterOfPosition(
    sourceFile,
    node.getStart(),
  );
  return `${sourceFile.fileName}:${line + 1}:${character + 1}`;
}

export function getTodoString(this: Transformer): string {
  return this.includeTodos ? `TODO(ts2hx)` : '';
}

export function commentOutNode(
  this: Transformer,
  node: ts.Node,
  warning?: string,
): string {
  if (warning) {
    logger.warn(warning, this.utils.getNodeSourcePath(node));
  }

  return this.includeComments
    ? `${
        this.includeTodos ? `/* ${this.utils.getTodoString()} */\n` : ''
      }${this.utils.getIndent(node)}/* ${node.getText()} */`
    : '';
}

export function createComment(
  this: Transformer,
  fn: (params: { todo: string }) => string,
): string {
  return this.includeComments
    ? `/* ${fn({ todo: this.utils.getTodoString() })} */`
    : '';
}

export function createTodoComment(this: Transformer): string {
  return this.utils.createComment(({ todo }) => todo);
}

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

export function getArrayTypeNode(
  this: Transformer,
  node: ts.Node,
): ts.Node | undefined {
  if (ts.isTypeReferenceNode(node) && node.typeName.getText() === 'Array') {
    return node.typeArguments?.[0];
  }
  if (ts.isArrayTypeNode(node)) {
    return node.elementType;
  }
}

export function toEitherType(
  this: Transformer,
  types: ts.NodeArray<ts.TypeNode>,
  context: VisitNodeContext,
): string | undefined {
  const res =
    types
      .map(
        (t, i) =>
          `${i < types.length - 1 ? 'EitherType<' : ''}${this.visitNode(
            t,
            context,
          )}`,
      )
      .join(', ') + '>'.repeat(types.length - 1);
  if (res) {
    this.imports.eitherType = true;
  }
  return res;
}

export function toExplicitBooleanCondition(
  this: Transformer,
  node: ts.Node,
): string | undefined {
  switch (node.kind) {
    case SyntaxKind.TrueKeyword:
    case SyntaxKind.FalseKeyword:
      return node.getText();
    case SyntaxKind.NullKeyword:
      return 'false';
  }

  if (ts.isNumericLiteral(node)) {
    return node.text === '0' ? 'false' : 'true';
  }
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return node.text === '' ? 'false' : 'true';
  }
  if (ts.isArrayLiteralExpression(node) || ts.isObjectLiteralExpression(node)) {
    return 'true';
  }

  if (!ts.isIdentifier(node)) return;

  if (node.text === 'undefined' || node.text === 'NaN') {
    return 'false';
  }

  const type = this.typeChecker.getTypeAtLocation(node);
  if (
    ts.TypeFlags.Boolean & type.flags ||
    ts.TypeFlags.BooleanLiteral & type.flags
  ) {
    return node.getText();
  }
  if (ts.TypeFlags.Number & type.flags) {
    return `${node.getText()} != 0`;
  }
  if (ts.TypeFlags.String & type.flags) {
    return `${node.getText()} != ""`;
  }
  return `${node.getText()} != null`;
}

export function toSeparateStatements(
  this: Transformer,
  node: ts.Node,
  context: VisitNodeContext,
): string {
  if (
    !(
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === SyntaxKind.CommaToken
    )
  ) {
    return this.visitNode(node, context);
  }
  return `${this.utils.getIndent(node)}${this.visitNode(
    node.left,
    context,
  )};\n${this.utils.getIndent(node)}${this.visitNode(node.right, context)};\n`;
}

export function escapeStringText(this: Transformer, text: string): string {
  return text.replace(/"/g, `\\"`);
}

export function escapeTemplateText(this: Transformer, text: string): string {
  return text.replace(/'/g, `\\'`);
}

export function joinNodes<T extends ts.Node>(
  this: Transformer,
  nodes: ts.NodeArray<T> | undefined,
  context: VisitNodeContext,
  separator = ', ',
): string {
  return nodes?.map((tp) => this.visitNode(tp, context)).join(separator) ?? '';
}

export function joinTypeParameters(
  this: Transformer,
  typeParameters: ts.NodeArray<ts.TypeParameterDeclaration> | undefined,
  context: VisitNodeContext,
): string {
  const typeParams = this.utils.joinNodes(typeParameters, context);
  return typeParams ? `<${typeParams}>` : '';
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

export function getRootSymbol(
  this: Transformer,
  node: ts.Node,
): ts.Symbol | undefined {
  const symbol = this.typeChecker.getSymbolAtLocation(node);
  if (!symbol) return;
  return symbol.flags & ts.SymbolFlags.Alias
    ? this.typeChecker.getAliasedSymbol(symbol)
    : symbol;
}

export function getDeclarationSourceFile(
  this: Transformer,
  node: ts.Node,
): ts.SourceFile | undefined {
  return this.utils.getRootSymbol(node)?.declarations?.[0].getSourceFile();
}

export function isBuiltInNode(this: Transformer, node: ts.Node): boolean {
  return !!this.utils
    .getRootSymbol(node)
    ?.declarations?.some((dec) =>
      /node_modules\/typescript\/lib\//gim.test(dec.getSourceFile().fileName),
    );
}

export function getSimpleTypeString(
  this: Transformer,
  node: ts.Node,
): 'string' | 'number' | 'boolean' | undefined {
  const type = this.typeChecker.getTypeAtLocation(node);
  const baseType = type.isLiteral()
    ? this.typeChecker.getBaseTypeOfLiteralType(type)
    : type;
  const name = this.typeChecker.typeToString(baseType);
  return ['string', 'number', 'boolean'].includes(name)
    ? (name as 'string')
    : undefined;
}
