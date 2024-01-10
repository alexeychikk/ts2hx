import ts from 'typescript';
import { type VisitNodeContext, type Transpiler } from '../Transpiler';

export function getArrayTypeNode(
  this: Transpiler,
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
  this: Transpiler,
  types: ts.NodeArray<ts.TypeNode>,
  context: VisitNodeContext,
): string {
  const emittedStrings = new Set<string>(
    types.map((node) => this.emitNode(node, context).trim()).filter(Boolean),
  );

  if (emittedStrings.size === 0) return 'Any';
  if (emittedStrings.size === 1) return Array.from(emittedStrings)[0];

  const hasNull = emittedStrings.delete('Null<Any>');
  if (hasNull && emittedStrings.size === 1) {
    return `Null<${Array.from(emittedStrings)[0]}>`;
  }

  this.imports.eitherType = true;
  const result =
    Array.from(emittedStrings)
      .map(
        (str, i) => `${i < emittedStrings.size - 1 ? 'EitherType<' : ''}${str}`,
      )
      .join(', ') + '>'.repeat(emittedStrings.size - 1);

  return hasNull ? `Null<${result}>` : result;
}

export function getRootSymbol(
  this: Transpiler,
  node: ts.Node,
): ts.Symbol | undefined {
  const symbol = this.typeChecker.getSymbolAtLocation(node);
  if (!symbol) return;
  return symbol.flags & ts.SymbolFlags.Alias
    ? this.typeChecker.getAliasedSymbol(symbol)
    : symbol;
}

export function getDeclarationSourceFile(
  this: Transpiler,
  node: ts.Node,
): ts.SourceFile | undefined {
  return this.utils.getRootSymbol(node)?.declarations?.[0].getSourceFile();
}

export function isBuiltInNode(this: Transpiler, node: ts.Node): boolean {
  return !!this.utils.getRootSymbol(node)?.declarations?.some((dec) => {
    const { fileName } = dec.getSourceFile();
    return (
      /node_modules\/typescript\/lib\//gim.test(fileName) ||
      /node_modules\/@types\/node\//gim.test(fileName)
    );
  });
}

export function getNodeTypeString(
  this: Transpiler,
  node: ts.Node,
  context: VisitNodeContext,
): string {
  const type = this.typeChecker.getTypeAtLocation(node);
  const baseType = type.isLiteral()
    ? this.typeChecker.getBaseTypeOfLiteralType(type)
    : type;
  const typeNode = this.typeChecker.typeToTypeNode(
    baseType,
    undefined,
    undefined,
  );
  if (!typeNode) return 'Void';
  const result = this.emitNode(typeNode, context);
  return (
    result ||
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
    type.aliasSymbol?.name ||
    this.emitNode(type.symbol.declarations?.[0], context) ||
    'Void'
  );
}

export function isPrimitiveInitializer(
  this: Transpiler,
  node: ts.Node,
): boolean {
  if (
    ts.isStringLiteral(node) ||
    ts.isNumericLiteral(node) ||
    ts.isNoSubstitutionTemplateLiteral(node) ||
    node.kind === ts.SyntaxKind.TrueKeyword ||
    node.kind === ts.SyntaxKind.FalseKeyword ||
    node.kind === ts.SyntaxKind.NullKeyword ||
    node.kind === ts.SyntaxKind.UndefinedKeyword
  ) {
    return true;
  }

  const symbol = this.typeChecker.getSymbolAtLocation(node);
  return !!symbol && this.typeChecker.isUndefinedSymbol(symbol);
}

/** TODO */
export function returnsPromise(
  this: Transpiler,
  node: ts.CallExpression,
): boolean {
  return false;
}
