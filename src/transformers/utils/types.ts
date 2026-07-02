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
  isReturnPosition = false,
): string {
  const emittedStrings = new Set<string>(
    types.map((node) => this.emitNode(node, context).trim()).filter(Boolean),
  );

  if (emittedStrings.size === 0) return 'Any';
  // Promise<void> | void — as a return type the union collapses to Void
  // (the result is ignored); as a value type the Void part means null
  let hasVoid = false;
  if (emittedStrings.has('Void')) {
    if (isReturnPosition) return 'Void';
    emittedStrings.delete('Void');
    hasVoid = true;
    if (emittedStrings.size === 0) return 'Null<Any>';
    if (emittedStrings.size === 1) {
      return `Null<${Array.from(emittedStrings)[0]}>`;
    }
  }
  if (emittedStrings.size === 1 && !hasVoid) {
    return Array.from(emittedStrings)[0];
  }

  const hasNull = emittedStrings.delete('Null<Any>') || hasVoid;
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
  const mapped = this.utils.getHaxeTypeString(type);
  if (mapped) return mapped;

  // anonymous structures can be emitted from their declaration
  const declaration = (type.aliasSymbol ?? type.getSymbol())?.declarations?.[0];
  if (declaration && ts.isTypeLiteralNode(declaration)) {
    const result = this.emitNode(declaration, context);
    if (result.trim()) return result;
  }

  return 'Any';
}

/**
 * Renders a checker-resolved type as Haxe code, mapping primitives, arrays
 * and simple named references. Returns undefined for anything that has no
 * safe textual representation (functions, anonymous structures, external
 * types) — callers are expected to fall back to Any.
 */
export function getHaxeTypeString(
  this: Transpiler,
  type: ts.Type,
  depth = 0,
): string | undefined {
  if (depth > 4) return;

  const baseType = type.isLiteral()
    ? this.typeChecker.getBaseTypeOfLiteralType(type)
    : type;

  if (baseType.isUnion()) {
    const parts = new Set<string>();
    let hasNull = false;
    for (const part of baseType.types) {
      if (part.flags & (ts.TypeFlags.Null | ts.TypeFlags.Undefined)) {
        hasNull = true;
        continue;
      }
      const partString = this.utils.getHaxeTypeString(part, depth + 1);
      if (!partString) return;
      parts.add(partString);
    }
    if (parts.size === 0) return 'Null<Any>';
    if (parts.has('Void')) return 'Void';

    let result: string;
    if (parts.size === 1) {
      result = Array.from(parts)[0];
    } else {
      this.imports.eitherType = true;
      result =
        Array.from(parts)
          .map((str, i) => `${i < parts.size - 1 ? 'EitherType<' : ''}${str}`)
          .join(', ') + '>'.repeat(parts.size - 1);
    }
    return hasNull ? `Null<${result}>` : result;
  }

  if (baseType.flags & (ts.TypeFlags.String | ts.TypeFlags.StringLiteral)) {
    return 'String';
  }
  if (baseType.flags & (ts.TypeFlags.Number | ts.TypeFlags.NumberLiteral)) {
    return 'Float';
  }
  if (baseType.flags & (ts.TypeFlags.Boolean | ts.TypeFlags.BooleanLiteral)) {
    return 'Bool';
  }
  if (baseType.flags & (ts.TypeFlags.Void | ts.TypeFlags.Never)) {
    return 'Void';
  }
  if (baseType.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) {
    return 'Any';
  }
  if (baseType.flags & (ts.TypeFlags.Null | ts.TypeFlags.Undefined)) {
    return 'Null<Any>';
  }

  const typeSymbolFlags =
    ts.SymbolFlags.Class |
    ts.SymbolFlags.Interface |
    ts.SymbolFlags.TypeAlias |
    ts.SymbolFlags.RegularEnum |
    ts.SymbolFlags.ConstEnum |
    ts.SymbolFlags.EnumMember |
    ts.SymbolFlags.TypeParameter;

  const symbol = baseType.aliasSymbol ?? baseType.getSymbol();
  // the name is only usable when it belongs to an actual type declaration
  // (and not e.g. to the property a function/object type was inferred from)
  if (
    !symbol ||
    !(symbol.flags & typeSymbolFlags) ||
    symbol.name.startsWith('__') ||
    !/^[A-Za-z_][A-Za-z0-9_]*$/.test(symbol.name)
  ) {
    return getCallSignatureTypeString.call(this, baseType, depth);
  }
  // external types have no Haxe counterpart
  const isExternal = !!symbol.declarations?.every((declaration) =>
    /[\\/]node_modules[\\/]/.test(declaration.getSourceFile().fileName),
  );
  if (isExternal && !['Array', 'Promise', 'Map', 'Set'].includes(symbol.name))
    return;

  // types declared in another module may not be imported here —
  // use their fully qualified Haxe path
  let symbolName = symbol.name;
  const declarationFile = symbol.declarations?.[0]?.getSourceFile();
  if (
    !isExternal &&
    !(symbol.flags & ts.SymbolFlags.TypeParameter) &&
    declarationFile &&
    declarationFile.fileName !== this.sourceFile.fileName
  ) {
    symbolName = `${this.utils.getImportedPackageName(
      declarationFile.fileName,
    )}.${symbol.name}`;
  }

  const objectFlags =
    baseType.flags & ts.TypeFlags.Object
      ? (baseType as ts.ObjectType).objectFlags
      : 0;
  const typeArguments =
    objectFlags & ts.ObjectFlags.Reference
      ? this.typeChecker.getTypeArguments(baseType as ts.TypeReference)
      : baseType.aliasSymbol
      ? baseType.aliasTypeArguments ?? []
      : [];

  if (!typeArguments.length) return symbolName;

  const argStrings: string[] = [];
  for (const argument of typeArguments) {
    const argString = this.utils.getHaxeTypeString(argument, depth + 1);
    if (!argString) return;
    argStrings.push(argString);
  }
  return `${symbolName}<${argStrings.join(', ')}>`;
}

/** Renders a purely-callable type as a Haxe function type */
function getCallSignatureTypeString(
  this: Transpiler,
  type: ts.Type,
  depth: number,
): string | undefined {
  const callSignatures = this.typeChecker.getSignaturesOfType(
    type,
    ts.SignatureKind.Call,
  );
  if (callSignatures.length !== 1) return;
  if (type.getProperties().length > 0) return;

  const signature = callSignatures[0];
  const parameterStrings: string[] = [];
  for (const parameter of signature.getParameters()) {
    const declaration = parameter.valueDeclaration;
    if (!declaration) return;
    const parameterType = this.typeChecker.getTypeOfSymbolAtLocation(
      parameter,
      declaration,
    );
    const parameterString = this.utils.getHaxeTypeString(
      parameterType,
      depth + 1,
    );
    if (!parameterString) return;
    parameterStrings.push(parameterString);
  }

  const returnString = this.utils.getHaxeTypeString(
    this.typeChecker.getReturnTypeOfSignature(signature),
    depth + 1,
  );
  if (!returnString) return;

  return `(${parameterStrings.join(', ')}) -> ${returnString}`;
}

export function isRegExpNode(this: Transpiler, node: ts.Node): boolean {
  if (ts.isRegularExpressionLiteral(node)) return true;
  const type = this.typeChecker.getTypeAtLocation(node).getNonNullableType();
  return type.getSymbol()?.name === 'RegExp';
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

/** Check if a call expression returns a Promise (or any thenable) */
export function returnsPromise(
  this: Transpiler,
  node: ts.CallExpression,
): boolean {
  if (this.utils.isCallOf(node, 'Promise.*')) return true;

  // Calls of nodes without positions (created during transformation)
  // cannot be resolved through the type checker
  if (node.expression.pos === -1) return false;

  try {
    const signature = this.typeChecker.getResolvedSignature(node);
    if (!signature) return false;

    const returnType = this.typeChecker.getReturnTypeOfSignature(signature);
    if (returnType.getSymbol()?.name === 'Promise') return true;

    // Promise-like structure with a .then method
    return !!returnType.getProperty('then');
  } catch {
    // Type checker may fail on nodes detached from the original source tree
    return false;
  }
}
