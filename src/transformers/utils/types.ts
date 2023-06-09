import ts from 'typescript';
import { type VisitNodeContext, type Transformer } from '../Transformer';

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
  return !!this.utils.getRootSymbol(node)?.declarations?.some((dec) => {
    const { fileName } = dec.getSourceFile();
    return (
      /node_modules\/typescript\/lib\//gim.test(fileName) ||
      /node_modules\/@types\/node\//gim.test(fileName)
    );
  });
}

export function getNodeTypeString(
  this: Transformer,
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
  return this.visitNode(typeNode, context);
}
