import ts, { SyntaxKind } from 'typescript';
import { type Transpiler, type EmitFn } from '../Transpiler';
import { TranspilerError } from '../../utils';
import { logger } from '../../Logger';

export const transformLiteralTypes: EmitFn = function (this: Transpiler, node) {
  if (!ts.isLiteralTypeNode(node)) return;
  // myVar: 42
  if (
    ts.isNumericLiteral(node.literal) ||
    // myVar: -1
    (ts.isPrefixUnaryExpression(node.literal) &&
      ts.isNumericLiteral(node.literal.operand))
  ) {
    return 'Float';
  }
  // myVar: "Hello"
  if (ts.isStringLiteral(node.literal)) {
    return 'String';
  }
  // myVar: true
  if (
    node.literal.kind === SyntaxKind.TrueKeyword ||
    node.literal.kind === SyntaxKind.FalseKeyword
  ) {
    return 'Bool';
  }
  // myVar: null
  if (node.literal.kind === SyntaxKind.NullKeyword) {
    return 'Null<Any>';
  }
};

export const transformArrayType: EmitFn = function (
  this: Transpiler,
  node,
  context,
) {
  // myVar: number[]
  if (!ts.isArrayTypeNode(node)) return;
  return `Array<${this.emitNode(node.elementType, context)}>`;
};

export const transformUnionType: EmitFn = function (
  this: Transpiler,
  node,
  context,
) {
  // myVar: string | boolean
  if (!ts.isUnionTypeNode(node)) return;
  const isReturnPosition =
    !!node.parent &&
    ts.isFunctionLike(node.parent) &&
    node.parent.type === node;
  return this.utils.toEitherType(node.types, context, isReturnPosition);
};

export const transformTupleType: EmitFn = function (
  this: Transpiler,
  node,
  context,
) {
  // myVar: [number, string]
  if (!ts.isTupleTypeNode(node)) return;
  const res = this.utils.toEitherType(node.elements, context);
  return `Array<${res}>`;
};

export const transformPropertySignature: EmitFn = function (
  this: Transpiler,
  node,
  context,
) {
  // { foo: string; }
  if (!ts.isPropertySignature(node)) return;

  if (ts.isComputedPropertyName(node.name)) {
    logger.warn(
      `Computed property name is not supported in property signature at`,
      this.utils.getNodeSourcePath(node.name),
    );
    return this.utils.commentOutNode(node);
  }

  const isOptional = !!node.questionToken;
  const isInterface = ts.isInterfaceDeclaration(node.parent);

  return `${
    isOptional && isInterface ? '@:optional ' : ''
  }public ${this.utils.getDeclarationKeyword(node)} ${
    isOptional && !isInterface ? '?' : ''
  }${this.emitNode(node.name, context).trim()}: ${
    node.type ? this.emitNode(node.type, context) : 'Any'
  };`;
};

export const transformPropertyName: EmitFn = function (this: Transpiler, node) {
  if (!ts.isPropertyName(node)) return;

  if (
    ts.isIdentifier(node) ||
    ts.isStringLiteral(node) ||
    ts.isNoSubstitutionTemplateLiteral(node) ||
    ts.isNumericLiteral(node) ||
    ts.isPrivateIdentifier(node)
  ) {
    return this.utils.toHaxeIdentifier(node.text);
  }

  if (ts.isComputedPropertyName(node)) {
    throw new TranspilerError(
      `ComputedPropertyName must be handled by parent's node transformer`,
      node,
    );
  }
};

export const transformIndexSignature: EmitFn = function (
  this: Transpiler,
  node,
) {
  // { [key: string]: number; }
  if (!ts.isIndexSignatureDeclaration(node)) return;

  return this.utils.commentOutNode(node, `Index signature is not supported`);
};

export const transformMethodSignature: EmitFn = function (
  this: Transpiler,
  node,
  context,
) {
  // { myMethod(): void; }
  if (!ts.isMethodSignature(node)) return;

  const isOptional = !!node.questionToken;
  const typeParams = this.utils.joinTypeParameters(
    node.typeParameters,
    context,
  );
  const params = this.utils.joinNodes(node.parameters, context);
  const ret = node.type ? this.emitNode(node.type, context) : 'Void';

  return `${
    isOptional ? '@:optional ' : ''
  }public function ${node.name.getText()}${typeParams}(${
    params || ''
  }):${ret};`;
};

export const transformConstructorSignature: EmitFn = function (
  this: Transpiler,
  node,
  context,
) {
  // { new(): MyClass; }
  if (!ts.isConstructSignatureDeclaration(node)) return;

  return this.utils.commentOutNode(
    node,
    `Constructor signature is not supported`,
  );
};

/** Names that clash with Haxe built-in types when used as type parameters */
const RESERVED_TYPE_PARAMETER_NAMES = new Set([
  'Any',
  'Array',
  'Bool',
  'Class',
  'Dynamic',
  'Enum',
  'Float',
  'Int',
  'String',
]);

export const transformTypeParameter: EmitFn = function (
  this: Transpiler,
  node,
  context,
) {
  // <T extends string> (without angle brackets)
  if (!ts.isTypeParameterDeclaration(node)) return;

  let constraint = node.constraint
    ? this.emitNode(node.constraint, context)
    : undefined;
  if (!constraint && node.default) {
    constraint = this.emitNode(node.default, context);
  }
  if (constraint) constraint = ` : ${constraint}`;

  let name = node.name.getText();
  if (RESERVED_TYPE_PARAMETER_NAMES.has(name)) {
    name = `T${name}`;
    this.utils.renameSymbolTo(node.name, name);
  }

  return `${name}${constraint ?? ''}`;
};

/** myVar: MyEnum.Member — enum members are not types in Haxe */
export const transformEnumMemberType: EmitFn = function (
  this: Transpiler,
  node,
  context,
) {
  if (!ts.isTypeReferenceNode(node)) return;
  if (!ts.isQualifiedName(node.typeName)) return;
  const symbol = this.utils.getRootSymbol(node.typeName);
  if (!symbol || !(symbol.flags & ts.SymbolFlags.EnumMember)) return;

  return this.emitNode(node.typeName.left, context).trim();
};

/**
 * Interfaces that are never implemented or extended act as structural
 * types (as all interfaces do in TS) — a typedef preserves that:
 * interface Foo { bar: string; } ==> typedef Foo = { public var bar: String; }
 */
export const transformStructuralInterface: EmitFn = function (
  this: Transpiler,
  node,
  context,
) {
  if (!ts.isInterfaceDeclaration(node)) return;
  if (
    !node.members.length ||
    node.members.some(
      (member) =>
        ts.isCallSignatureDeclaration(member) ||
        ts.isConstructSignatureDeclaration(member),
    )
  ) {
    return;
  }
  if (node.name.pos === -1) return;
  const symbol = this.typeChecker.getSymbolAtLocation(node.name);
  if (!symbol || getNominalInterfaceSymbols.call(this).has(symbol)) return;

  const typeParams = this.utils.joinTypeParameters(
    node.typeParameters,
    context,
  );
  const members = node.members
    .map((member) => this.emitNode(member, context))
    .join('');

  // extended types become structure intersections: typedef A = B & { ... }
  let unsupportedBases = '';
  const bases: string[] = [];
  for (const clause of node.heritageClauses ?? []) {
    for (const type of clause.types) {
      const isExternal = !!this.utils
        .getRootSymbol(type.expression)
        ?.declarations?.every((declaration) =>
          /[\\/]node_modules[\\/]/.test(declaration.getSourceFile().fileName),
        );
      if (isExternal) {
        logger.warn(
          `Heritage clause with an external type is not supported at`,
          this.utils.getNodeSourcePath(type),
        );
        unsupportedBases += this.utils.createComment(
          ({ todo }) => `${todo} extends ${type.getText()}`,
        );
        continue;
      }
      bases.push(this.emitNode(type, context).trim());
    }
  }

  return `typedef ${this.utils.toHaxeIdentifier(
    node.name.text,
  )}${typeParams} = ${unsupportedBases}${[
    ...bases,
    `{${members}\n${this.utils.getIndent(node)}}`,
  ].join(' & ')};`;
};

/**
 * Symbols of interfaces that must stay nominal in Haxe: everything
 * a class implements or extends, plus the ancestors of those interfaces
 */
const nominalSymbolsCache = new WeakMap<ts.Program, Set<ts.Symbol>>();
function getNominalInterfaceSymbols(this: Transpiler): Set<ts.Symbol> {
  const cached = nominalSymbolsCache.get(this.program);
  if (cached) return cached;

  const symbols = new Set<ts.Symbol>();
  const addWithAncestors = (symbol: ts.Symbol | undefined): void => {
    if (!symbol || symbols.has(symbol)) return;
    symbols.add(symbol);
    for (const declaration of symbol.declarations ?? []) {
      if (
        ts.isInterfaceDeclaration(declaration) &&
        declaration.heritageClauses
      ) {
        for (const clause of declaration.heritageClauses) {
          for (const type of clause.types) {
            addWithAncestors(this.utils.getRootSymbol(type.expression));
          }
        }
      }
    }
  };

  for (const sourceFile of this.program.getSourceFiles()) {
    if (sourceFile.isDeclarationFile) continue;
    const visit = (node: ts.Node): void => {
      if (ts.isClassLike(node) && node.heritageClauses) {
        for (const clause of node.heritageClauses) {
          for (const type of clause.types) {
            addWithAncestors(this.utils.getRootSymbol(type.expression));
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
  }
  nominalSymbolsCache.set(this.program, symbols);
  return symbols;
}

/**
 * TS type parameters may have defaults and be omitted at the usage site,
 * Haxe requires them all: `foo: Food` ==> `foo: Food<Meta>`
 */
export const transformMissingTypeArguments: EmitFn = function (
  this: Transpiler,
  node,
  context,
) {
  if (
    !(ts.isTypeReferenceNode(node) || ts.isExpressionWithTypeArguments(node))
  ) {
    return;
  }

  const typeNameNode = ts.isTypeReferenceNode(node)
    ? node.typeName
    : node.expression;
  const symbol = this.utils.getRootSymbol(typeNameNode);
  const declaration = symbol?.declarations?.find(
    (
      dec,
    ): dec is
      | ts.ClassDeclaration
      | ts.InterfaceDeclaration
      | ts.TypeAliasDeclaration =>
      ts.isClassDeclaration(dec) ||
      ts.isInterfaceDeclaration(dec) ||
      ts.isTypeAliasDeclaration(dec),
  );
  const typeParameters = declaration?.typeParameters;
  if (!typeParameters?.length) return;
  if (/[\\/]node_modules[\\/]/.test(declaration!.getSourceFile().fileName)) {
    return;
  }

  const provided = node.typeArguments?.length ?? 0;
  if (provided >= typeParameters.length) return;
  // only type parameters with defaults can be omitted in TS
  if (!typeParameters.slice(provided).every((tp) => tp.default)) return;

  let resolvedArguments: readonly ts.Type[] = [];
  try {
    const type = this.typeChecker.getTypeAtLocation(node);
    const objectFlags =
      type.flags & ts.TypeFlags.Object
        ? (type as ts.ObjectType).objectFlags
        : 0;
    resolvedArguments =
      objectFlags & ts.ObjectFlags.Reference
        ? this.typeChecker.getTypeArguments(type as ts.TypeReference)
        : type.aliasTypeArguments ?? [];
  } catch {
    resolvedArguments = [];
  }

  const args = typeParameters.map((typeParameter, index) => {
    if (index < provided) {
      return this.emitNode(node.typeArguments![index], context).trim();
    }
    const resolved = resolvedArguments[index]
      ? this.utils.getHaxeTypeString(resolvedArguments[index])
      : undefined;
    return resolved ?? 'Any';
  });

  return `${this.emitNode(typeNameNode, context).trim()}<${args.join(', ')}>`;
};

export const transformIntersectionType: EmitFn = function (
  this: Transpiler,
  node,
  context,
) {
  // myVar: Foo & Bar
  if (!ts.isIntersectionTypeNode(node)) return;
  // `typedef X = A & B;` is valid Haxe (structure intersection)
  if (ts.isTypeAliasDeclaration(node.parent)) return;

  logger.warn(
    `Intersection type is only supported in a type alias at`,
    this.utils.getNodeSourcePath(node),
  );
  const [first, ...rest] = node.types;
  return `${this.emitNode(first, context).trim()} ${this.utils.createComment(
    ({ todo }) => `${todo} & ${rest.map((type) => type.getText()).join(' & ')}`,
  )}`;
};

export const transformTypePredicate: EmitFn = function (
  this: Transpiler,
  node,
) {
  // (foo): foo is Bar => ...
  if (!ts.isTypePredicateNode(node)) return;
  return 'Bool';
};

export const transformConstructorType: EmitFn = function (
  this: Transpiler,
  node,
) {
  // myVar: new (...args: any[]) => Foo
  if (!ts.isConstructorTypeNode(node)) return;

  logger.warn(
    `Constructor type is not supported at`,
    this.utils.getNodeSourcePath(node),
  );
  return (
    this.utils.createComment(({ todo }) => `${todo} ${node.getText()}`) +
    ' Class<Any>'
  );
};

export const transformGenericFunctionType: EmitFn = function (
  this: Transpiler,
  node,
  context,
) {
  // type Fn = <T extends Foo>(x: T) => T
  if (!ts.isFunctionTypeNode(node) || !node.typeParameters?.length) return;

  logger.warn(
    `Function type cannot have type parameters in Haxe at`,
    this.utils.getNodeSourcePath(node),
  );

  // substitute each type parameter with its constraint (or Any)
  for (const typeParameter of node.typeParameters) {
    const replacement = typeParameter.constraint
      ? this.emitNode(typeParameter.constraint, context).trim()
      : 'Any';
    this.utils.renameSymbolTo(typeParameter.name, replacement);
  }

  const comment = this.utils.createComment(
    ({ todo }) =>
      `${todo} <${node.typeParameters!.map((tp) => tp.getText()).join(', ')}>`,
  );
  const params = this.utils.joinNodes(node.parameters, context);
  const returnType = this.emitNode(node.type, context).trim();
  return `${comment} (${params}) -> ${returnType}`;
};

export const transformInterfaceCallSignatures: EmitFn = function (
  this: Transpiler,
  node,
  context,
) {
  // interface Fn<T> { (x: T): R; }
  if (!ts.isInterfaceDeclaration(node)) return;
  const callSignatures = node.members.filter(ts.isCallSignatureDeclaration);
  if (!callSignatures.length) return;

  // an interface that is nothing but a call signature is a function typedef
  if (node.members.length === 1) {
    const [signature] = callSignatures;
    const typeParams = this.utils.joinTypeParameters(
      [...(node.typeParameters ?? []), ...(signature.typeParameters ?? [])],
      context,
    );
    const params = this.utils.joinNodes(signature.parameters, context);
    const returnType = signature.type
      ? this.emitNode(signature.type, context).trim()
      : 'Void';
    return `typedef ${this.utils.toHaxeIdentifier(
      node.name.text,
    )}${typeParams} = (${params}) -> ${returnType};`;
  }
};

export const transformCallSignature: EmitFn = function (
  this: Transpiler,
  node,
) {
  // { (): void; }
  if (!ts.isCallSignatureDeclaration(node)) return;

  return this.utils.commentOutNode(node, `Call signature is not supported`);
};

export const transformConditionalType: EmitFn = function (
  this: Transpiler,
  node,
  context,
) {
  // T extends Foo ? string : number
  if (!ts.isConditionalTypeNode(node)) return;

  const comment = this.utils.commentOutNode(
    node,
    `Conditional type is not supported`,
  );
  return `${comment} Any`;
};

export const transformTypeQuery: EmitFn = function (
  this: Transpiler,
  node,
  context,
) {
  // type T = typeof MY_VAR
  if (!ts.isTypeQueryNode(node)) return;

  const comment = this.utils.commentOutNode(
    node,
    `typeof type query is not supported`,
  );
  return `${comment} Any`;
};

export const transformEnumDeclaration: EmitFn = function (
  this: Transpiler,
  node,
  context,
) {
  // enum Foo { Bar, Baz }
  if (!ts.isEnumDeclaration(node)) return;

  const firstInitializer = node.members[0]?.initializer;
  const underlyingType =
    !!firstInitializer &&
    this.utils.getNodeTypeString(firstInitializer, context) === 'String'
      ? 'String'
      : 'Int';

  const members = node.members
    .map((member) => {
      const initializer = member.initializer
        ? ` = ${this.emitNode(member.initializer, context)}`
        : '';
      return `${this.utils.getIndent(
        node,
      )}  var ${member.name.getText()}${initializer};`;
    })
    .join('\n');

  return `enum abstract ${this.utils.toHaxeIdentifier(
    node.name.text,
  )}(${underlyingType}) from ${underlyingType} to ${underlyingType} {\n${members}\n}`;
};

export const transformIndexedAccessType: EmitFn = function (
  this: Transpiler,
  node,
  context,
) {
  // type FooBar = Foo['bar'];
  if (!ts.isIndexedAccessTypeNode(node)) return;

  return this.utils.getNodeTypeString(node, context);
};

export const transformAsExpression: EmitFn = function (
  this: Transpiler,
  node,
  context,
) {
  if (!ts.isAsExpression(node)) return;

  // as const
  if (
    ts.isTypeReferenceNode(node.type) &&
    node.type.typeName.getText() === 'const'
  ) {
    return this.emitNode(node.expression, context);
  }

  // myVar = hisVar as T — TS 'as' is an unchecked assertion, so the value
  // must not be typechecked against the target (cast), only retyped (: T)
  const expression = this.emitNode(node.expression, context).trim();
  const type =
    node.type.kind === SyntaxKind.AnyKeyword ||
    node.type.kind === SyntaxKind.UnknownKeyword
      ? // Dynamic, unlike Any, allows further field access
        'Dynamic'
      : this.emitNode(node.type, context).trim();
  const code = `cast ${expression} : ${type}`;

  return ts.isParenthesizedExpression(node.parent) ? code : `(${code})`;
};
