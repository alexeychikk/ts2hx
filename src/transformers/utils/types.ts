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
  const emittedStrings = types
    .reduce((res, typeNode) => {
      const str = this.emitNode(typeNode, context);
      if (str.trim() !== (res[res.length - 1] || '').trim()) res.push(str);
      return res;
    }, [] as string[])
    .filter(Boolean);

  if (!emittedStrings.length) return 'Any';

  this.imports.eitherType = true;
  return (
    emittedStrings
      .map(
        (str, i) =>
          `${i < emittedStrings.length - 1 ? 'EitherType<' : ''}${str}`,
      )
      .join(', ') + '>'.repeat(emittedStrings.length - 1)
  );
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

export function isSimpleType(this: Transpiler, node: ts.Node): boolean {
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
