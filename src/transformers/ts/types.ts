import ts from 'typescript';
import path from 'path';
import { type TransformerFn, type Transpiler } from '../Transpiler';

/**
 * In Haxe all types of a package share one namespace regardless of the
 * module they are declared in. Non-exported (module-local) types with
 * generic names would collide across modules — prefix them with the
 * module name:
 * type Fn = ...; ==> typedef MyModule_Fn = ...;
 */
export const transformLocalTypeNames: TransformerFn = function (
  this: Transpiler,
  node,
  context,
) {
  if (!ts.isSourceFile(node)) return;

  // a file without exports is a standalone script — nothing imports it,
  // so its local names cannot collide
  const hasExports = node.statements.some(
    (statement) =>
      ts.isExportDeclaration(statement) ||
      ts.isExportAssignment(statement) ||
      (ts.canHaveModifiers(statement) &&
        statement.modifiers?.some(
          (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword,
        )),
  );
  if (!hasExports) return;

  const moduleName = path
    .basename(this.utils.getHaxeFilePath())
    .replace(/\.hx$/, '');

  const renames = new Map<ts.Symbol, string>();
  for (const statement of node.statements) {
    if (
      (ts.isTypeAliasDeclaration(statement) ||
        ts.isInterfaceDeclaration(statement) ||
        ts.isEnumDeclaration(statement) ||
        ts.isClassDeclaration(statement)) &&
      statement.name &&
      !statement.modifiers?.some(
        (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword,
      )
    ) {
      const symbol = this.typeChecker.getSymbolAtLocation(statement.name);
      if (symbol) {
        renames.set(symbol, `${moduleName}_${statement.name.text}`);
      }
    }
  }
  if (!renames.size) return;

  const visit = (child: ts.Node): ts.Node => {
    if (ts.isIdentifier(child) && child.pos !== -1) {
      let symbol: ts.Symbol | undefined;
      try {
        symbol = this.typeChecker.getSymbolAtLocation(child);
      } catch {
        symbol = undefined;
      }
      const newName = symbol && renames.get(symbol);
      if (newName) return context.factory.createIdentifier(newName);
    }
    return ts.visitEachChild(child, visit, context);
  };
  return ts.visitEachChild(node, visit, context);
};

export const transformTemplateLiteralType: TransformerFn = function (
  this: Transpiler,
  node,
  context,
) {
  /* type A = 'foo' | 'bar';
     type B = `Hello ${A}`; */
  if (!ts.isTemplateLiteralTypeNode(node)) return;

  return context.factory.createKeywordTypeNode(ts.SyntaxKind.StringKeyword);
};

export const removeNonNullExpression: TransformerFn = function (
  this: Transpiler,
  node,
) {
  // foo!.bar
  if (!ts.isNonNullExpression(node)) return;

  return node.expression;
};

export const removeNonNullAssertion: TransformerFn = function (
  this: Transpiler,
  node,
  context,
) {
  if (ts.isVariableDeclaration(node)) {
    return context.factory.updateVariableDeclaration(
      node,
      node.name,
      undefined, // remove exclamationToken
      node.type,
      node.initializer,
    );
  }

  if (ts.isPropertyDeclaration(node)) {
    return context.factory.updatePropertyDeclaration(
      node,
      node.modifiers,
      node.name,
      node.questionToken, // replace with questionToken if available
      node.type,
      node.initializer,
    );
  }

  // TODO: ts.FunctionLikeDeclarationBase has optional exclamationToken
};

export const transformMappedType: TransformerFn = function (
  this: Transpiler,
  node,
  context,
) {
  // { [key in Foo]: number } ==> Dynamic<number>
  // (mapped types are plain objects at runtime, not haxe.ds Maps)
  if (!ts.isMappedTypeNode(node)) return;

  const keyNode =
    node.typeParameter.constraint ??
    context.factory.createKeywordTypeNode(ts.SyntaxKind.StringKeyword);

  // the value type may reference the mapped-type parameter
  // ({ [key in Foo]: Bar<key> }) — substitute it with the key type
  const parameterName = node.typeParameter.name.text;
  const substituteParameter = (child: ts.Node): ts.Node => {
    if (
      ts.isTypeReferenceNode(child) &&
      ts.isIdentifier(child.typeName) &&
      child.typeName.text === parameterName
    ) {
      return keyNode;
    }
    return ts.visitEachChild(child, substituteParameter, context);
  };
  const substitutedType = node.type
    ? (substituteParameter(node.type) as ts.TypeNode)
    : undefined;

  const valueNode =
    (substitutedType && node.questionToken
      ? context.factory.createUnionTypeNode([
          substitutedType,
          context.factory.createKeywordTypeNode(ts.SyntaxKind.UndefinedKeyword),
        ])
      : substitutedType) ??
    context.factory.createTypeReferenceNode(
      context.factory.createIdentifier('Any'),
    );

  return context.factory.createTypeReferenceNode(
    context.factory.createIdentifier('Dynamic'),
    [valueNode],
  );
};

export const transformKeyofTypeOperator: TransformerFn = function (
  this: Transpiler,
  node,
  context,
) {
  // keyof Foo
  if (!ts.isTypeOperatorNode(node)) return;

  return context.factory.createKeywordTypeNode(ts.SyntaxKind.StringKeyword);
};
