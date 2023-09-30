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
): string | undefined {
  const res =
    types
      .map(
        (t, i) =>
          `${i < types.length - 1 ? 'EitherType<' : ''}${this.emitNode(
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
  const symbol = this.typeChecker.getSymbolAtLocation(node);
  return (
    ts.isStringLiteral(node) ||
    ts.isNumericLiteral(node) ||
    ts.isNoSubstitutionTemplateLiteral(node) ||
    node.kind === ts.SyntaxKind.TrueKeyword ||
    node.kind === ts.SyntaxKind.FalseKeyword ||
    node.kind === ts.SyntaxKind.NullKeyword ||
    node.kind === ts.SyntaxKind.UndefinedKeyword ||
    (!!symbol && this.typeChecker.isUndefinedSymbol(symbol))
  );
}
