import ts from 'typescript';

import {
  ANY,
  arrayType,
  BOOL,
  dictType,
  DYNAMIC,
  FLOAT,
  STRING,
  VOID,
} from '../ir/builders';
import type {
  HxAnonField,
  HxDecl,
  HxType,
  HxTypeParam,
  HxTypePath,
} from '../ir/types';
import { escapeIdentifier, HAXE_STD_TYPES, MAIN_CLASS } from '../model/names';
import { libErrorClassPath } from '../stdlib/errors';
import { libAsyncType } from '../stdlib/promise-bindings';
import { libRegExpType } from '../stdlib/regexp-bindings';
import { ancestors, isHoistedClass } from './classes';

const NULLISH = ts.TypeFlags.Null | ts.TypeFlags.Undefined | ts.TypeFlags.Void;
/** `CheckFlags.Readonly` of a symbol synthesized by a mapped type (`Readonly<T>`). */
const CHECK_FLAGS_READONLY = 1 << 3;

/** Whether values of this Haxe type can hold `null` on every target. */
export function isNullable(type: HxType): boolean {
  if (type.kind === 'null' || type.kind === 'dynamic') {
    return true;
  }
  if (type.kind === 'path' && type.path.pack.length === 0) {
    return !['Float', 'Int', 'Bool'].includes(type.path.name);
  }
  return type.kind !== 'typeParam';
}

export function nullable(type: HxType): HxType {
  return isNullable(type) ? type : { kind: 'null', inner: type };
}

/** `Null<T>` even for types Haxe already lets hold `null`, to mark a value that may be `undefined`. */
export function explicitlyNullable(type: HxType): HxType {
  return type.kind === 'null' || type.kind === 'dynamic'
    ? type
    : { kind: 'null', inner: type };
}

/** Whether a file is an npm package's declaration, not the TS lib or `@types/node`. */
export function isExternalFile(fileName: string): boolean {
  return (
    /[\\/]node_modules[\\/]/.test(fileName) &&
    !/[\\/]node_modules[\\/]@types[\\/]node[\\/]/.test(fileName) &&
    !/[\\/]node_modules[\\/]typescript[\\/]lib[\\/]lib\.[^\\/]*\.d\.ts$/.test(
      fileName,
    )
  );
}

/** A type an npm package declares: `Dynamic` (or a `Dict`), never a mapped structure. */
function isExternalType(type: ts.Type): boolean {
  const symbol = type.aliasSymbol ?? type.getSymbol();
  const declarations = symbol?.declarations ?? [];
  return (
    declarations.length > 0 &&
    declarations.every((d) => isExternalFile(d.getSourceFile().fileName))
  );
}

/** Haxe module path of a project source file, or `undefined` for lib and external files. */
export type ModulePathResolver = (
  sourceFile: ts.SourceFile,
) => HxTypePath | undefined;

type TypedefDeclaration = ts.InterfaceDeclaration | ts.TypeAliasDeclaration;

/**
 * A Haxe type name for a TS interface, alias, class, enum or namespace name: upper-case
 * first, and suffixed `_` when it would redefine a Haxe standard type, name its own
 * module or the generated `Main` (Haxe type names are unique per package), or shadow a
 * `reserved` name (the modules of the empty package).
 */
export function typedefName(
  name: string,
  moduleName: string,
  reserved: ReadonlySet<string> = new Set(),
): string {
  const escaped = escapeIdentifier(name);
  let capitalised = escaped[0].toUpperCase() + escaped.slice(1);
  if (HAXE_STD_TYPES.has(capitalised)) {
    capitalised = `${capitalised}_`;
  }
  return capitalised === moduleName ||
    capitalised === MAIN_CLASS ||
    reserved.has(capitalised)
    ? `${capitalised}_`
    : capitalised;
}

/** The Haxe name of a project class: like a typedef, it must start upper-case. */
export function className(
  name: string,
  moduleName: string,
  reserved: ReadonlySet<string> = new Set(),
): string {
  return typedefName(name, moduleName, reserved);
}

/** Maps checker types to Haxe types: the single place doing so (ADR 0001). */
export class TypeMapper {
  private readonly visiting = new Set<ts.Type>();
  private readonly typeParamConstraints = new Map<
    ts.Symbol,
    HxType[] | undefined
  >();
  private readonly erasedSignatureParams = new Set<ts.Symbol>();
  private readonly decidingTypeParams: ts.Symbol[] = [];
  private readonly cyclicTypeParams = new Set<ts.Symbol>();
  private readonly classDeclarations = new Map<
    string,
    ts.ClassLikeDeclaration
  >();

  constructor(
    private readonly checker: ts.TypeChecker,
    private readonly modulePath: ModulePathResolver = () => undefined,
    private readonly hoistedClassPath: (
      node: ts.ClassLikeDeclaration,
    ) => HxTypePath | undefined = () => undefined,
    private readonly declaredTypeName: (
      declaration: ts.Declaration,
    ) => string | undefined = () => undefined,
  ) {}

  /** Haxe type of a value of TS type `type`. */
  map(type: ts.Type): HxType {
    if (this.visiting.has(type)) {
      return DYNAMIC;
    }
    this.visiting.add(type);
    try {
      return this.mapUncached(type);
    } finally {
      this.visiting.delete(type);
    }
  }

  /** Haxe return type: `void` and `undefined` become `Void`. */
  mapReturn(type: ts.Type): HxType {
    return type.flags & (ts.TypeFlags.Void | ts.TypeFlags.Undefined)
      ? VOID
      : this.map(type);
  }

  /**
   * The `typedef`s of a source file: one per top-level, non-generic interface or
   * object type alias whose type maps to an anonymous structure (ADR 0005).
   */
  typedefs(sourceFile: ts.SourceFile): HxDecl[] {
    const decls: HxDecl[] = [];
    const seen = new Set<ts.Symbol>();
    for (const statement of sourceFile.statements) {
      if (
        !ts.isInterfaceDeclaration(statement) &&
        !ts.isTypeAliasDeclaration(statement)
      ) {
        continue;
      }
      const symbol = this.checker.getSymbolAtLocation(statement.name);
      if (!symbol || seen.has(symbol)) continue;
      seen.add(symbol);
      const path = this.typedefPath(symbol);
      if (!path) continue;
      const type = this.declaredType(symbol);
      const aliased = this.typedefReference(type);
      decls.push({
        kind: 'typedef',
        name: path.name,
        typeParams: [],
        type:
          aliased && aliased.name !== path.name
            ? { kind: 'path', path: aliased, params: [] }
            : this.structure(type),
      });
    }
    return decls;
  }

  private declaredType(symbol: ts.Symbol): ts.Type {
    return this.checker.getDeclaredTypeOfSymbol(symbol);
  }

  /**
   * Haxe path of the typedef an interface or alias becomes: declared at the top
   * level of a project module, without type parameters, with a structure type.
   */
  typedefPath(symbol: ts.Symbol): HxTypePath | undefined {
    const declarations = (symbol.declarations ?? []).filter(
      (d): d is TypedefDeclaration =>
        ts.isInterfaceDeclaration(d) || ts.isTypeAliasDeclaration(d),
    );
    const first = declarations[0];
    if (
      !first ||
      declarations.length !== (symbol.declarations ?? []).length ||
      declarations.some(
        (d) => !ts.isSourceFile(d.parent) || d.typeParameters !== undefined,
      ) ||
      symbol.flags & (ts.SymbolFlags.Value | ts.SymbolFlags.Class)
    ) {
      return undefined;
    }
    const module = this.modulePath(first.getSourceFile());
    if (!module || !this.isStructure(this.declaredType(symbol))) {
      return undefined;
    }
    return {
      pack: module.pack,
      module: module.module,
      name:
        this.declaredTypeName(first) ?? typedefName(symbol.name, module.module),
    };
  }

  /**
   * The Haxe type parameters of a class, function or method declaration: those it
   * keeps generic. Others are erased to `Dynamic` (ADR 0005).
   */
  typeParams(node: ts.Declaration): HxTypeParam[] {
    const declarations = ts.getEffectiveTypeParameterDeclarations(
      node as ts.DeclarationWithTypeParameters,
    );
    return declarations.flatMap((declaration) => {
      const symbol = this.checker.getSymbolAtLocation(declaration.name);
      const constraints = symbol && this.keptConstraints(symbol);
      return constraints
        ? [{ name: escapeIdentifier(symbol.name), constraints }]
        : [];
    });
  }

  /**
   * The Haxe constraints of a type parameter kept generic, or `undefined` when it is
   * erased: it belongs to a declaration Haxe cannot make generic (arrows, function
   * expressions, signatures, interfaces, aliases), its constraint is not a project
   * class or typedef, or its constraint refers back to it (`T extends Node<T>`).
   */
  private keptConstraints(symbol: ts.Symbol): HxType[] | undefined {
    const deciding = this.decidingTypeParams.indexOf(symbol);
    if (deciding >= 0) {
      this.decidingTypeParams
        .slice(deciding)
        .forEach((s) => this.cyclicTypeParams.add(s));
      return undefined;
    }
    if (this.typeParamConstraints.has(symbol)) {
      return this.typeParamConstraints.get(symbol);
    }
    this.decidingTypeParams.push(symbol);
    try {
      const constraints = this.constraintsOf(symbol);
      const kept = this.cyclicTypeParams.has(symbol) ? undefined : constraints;
      this.typeParamConstraints.set(symbol, kept);
      return kept;
    } finally {
      this.decidingTypeParams.pop();
    }
  }

  private constraintsOf(symbol: ts.Symbol): HxType[] | undefined {
    const declaration = symbol.declarations?.find(
      ts.isTypeParameterDeclaration,
    );
    if (!declaration || !isHaxeGenericDeclaration(declaration.parent)) {
      return undefined;
    }
    const constraintNode =
      ts.getEffectiveConstraintOfTypeParameter(declaration);
    let constraints: HxType[] | undefined = [];
    if (constraintNode) {
      const constraint = this.map(
        this.checker.getTypeFromTypeNode(constraintNode),
      );
      constraints =
        constraint.kind === 'path' && !isPrimitivePath(constraint.path)
          ? [constraint]
          : undefined;
    }
    return constraints;
  }

  private mapUncached(type: ts.Type): HxType {
    const flags = type.flags;
    if (flags & ts.TypeFlags.NumberLike) return FLOAT;
    if (flags & ts.TypeFlags.StringLike) return STRING;
    if (flags & ts.TypeFlags.BooleanLike) return BOOL;
    if (flags & ts.TypeFlags.Unknown) return ANY;
    if (flags & ts.TypeFlags.TypeParameter) {
      if ((type as { isThisType?: boolean }).isThisType) {
        const constraint = type.getConstraint();
        return constraint ? this.map(constraint) : DYNAMIC;
      }
      return type.symbol &&
        !this.erasedSignatureParams.has(type.symbol) &&
        this.keptConstraints(type.symbol)
        ? { kind: 'typeParam', name: escapeIdentifier(type.symbol.name) }
        : DYNAMIC;
    }
    if (type.isUnion()) {
      return this.mapUnion(type);
    }
    if (type.isIntersection() || flags & ts.TypeFlags.Object) {
      return this.mapObject(type);
    }
    return DYNAMIC;
  }

  /** Literal unions of one primitive collapse to it; other unions are `Dynamic`. */
  private mapUnion(type: ts.UnionType): HxType {
    const present = type.types.filter((t) => !(t.flags & NULLISH));
    const hasNullish = present.length < type.types.length;
    const mapped = present.map((t) => this.map(t));
    const first = mapped[0];
    const same =
      first !== undefined &&
      mapped.every((m) => JSON.stringify(m) === JSON.stringify(first));
    if (!same) {
      return DYNAMIC;
    }
    return hasNullish ? nullable(first) : first;
  }

  private mapObject(type: ts.Type): HxType {
    if (this.checker.isTupleType(type)) {
      return arrayType(DYNAMIC);
    }
    if (this.checker.isArrayType(type)) {
      const [element] = this.checker.getTypeArguments(type as ts.TypeReference);
      return arrayType(element ? this.map(element) : DYNAMIC);
    }
    if (isExternalType(type)) {
      const value = this.dictValueType(type);
      return value ? dictType(this.map(value)) : DYNAMIC;
    }
    const libInstance =
      this.errorInstanceType(type) ??
      libRegExpType(type) ??
      libAsyncType(type, this.checker, (t) => this.map(t));
    if (libInstance) {
      return libInstance;
    }
    const instance = this.classInstanceType(type);
    if (instance) {
      return instance;
    }
    const typedef = this.typedefReference(type);
    if (typedef) {
      return { kind: 'path', path: typedef, params: [] };
    }
    const dictValue = this.dictValueType(type);
    if (dictValue) {
      return dictType(this.map(dictValue));
    }
    const properties = this.checker.getPropertiesOfType(type);
    const calls = type.getCallSignatures();
    if (calls.length === 1 && properties.length === 0) {
      return this.signatureType(calls[0]);
    }
    return this.isStructure(type) ? this.structure(type) : DYNAMIC;
  }

  /**
   * Haxe path of the class a project class becomes: a named class declared at the
   * top level of a project module, merged at most with interfaces and namespaces.
   */
  classPath(symbol: ts.Symbol): HxTypePath | undefined {
    const declarations = symbol.declarations ?? [];
    const hoisted = declarations.find(isHoistedClass);
    if (hoisted && symbol.flags & ts.SymbolFlags.Class) {
      const path = this.hoistedClassPath(hoisted);
      if (path) this.classDeclarations.set(pathKey(path), hoisted);
      return path;
    }
    const declaration = declarations.find(ts.isClassDeclaration);
    if (
      !(symbol.flags & ts.SymbolFlags.Class) ||
      !declaration?.name ||
      !ts.isSourceFile(declaration.parent) ||
      declarations.some(
        (d) =>
          d !== declaration &&
          !ts.isInterfaceDeclaration(d) &&
          !ts.isModuleDeclaration(d),
      )
    ) {
      return undefined;
    }
    const module = this.modulePath(declaration.getSourceFile());
    if (!module) {
      return undefined;
    }
    const path = {
      pack: module.pack,
      module: module.module,
      name:
        this.declaredTypeName(declaration) ??
        className(declaration.name.text, module.module),
    };
    this.classDeclarations.set(pathKey(path), declaration);
    return path;
  }

  /** Whether the project class at `from` extends the one at `to`, so Haxe upcasts it implicitly. */
  isSubclass(from: HxTypePath, to: HxTypePath): boolean {
    const declaration = this.classDeclarations.get(pathKey(from));
    const target = pathKey(to);
    return (
      !!declaration &&
      ancestors(this.checker, declaration).some((ancestor) => {
        const symbol =
          ancestor.name && this.checker.getSymbolAtLocation(ancestor.name);
        const path = symbol && this.classPath(symbol);
        return !!path && pathKey(path) === target;
      })
    );
  }

  /** `ts2hx.Error` (or a subclass) for an instance of a lib error class. */
  private errorInstanceType(type: ts.Type): HxType | undefined {
    const symbol = type.symbol;
    const path =
      symbol &&
      symbol.flags & ts.SymbolFlags.Interface &&
      libErrorClassPath(symbol);
    return path ? { kind: 'path', path, params: [] } : undefined;
  }

  /** `pack.Module.C<T>` for an instance type of a project class. */
  private classInstanceType(type: ts.Type): HxType | undefined {
    const objectFlags = (type as ts.ObjectType).objectFlags ?? 0;
    const target =
      objectFlags & ts.ObjectFlags.Reference
        ? (type as ts.TypeReference).target
        : type;
    if (
      !type.symbol ||
      !(((target as ts.ObjectType).objectFlags ?? 0) & ts.ObjectFlags.Class)
    ) {
      return undefined;
    }
    const path = this.classPath(type.symbol);
    if (!path) {
      return undefined;
    }
    const typeParameters = (target as ts.InterfaceType).typeParameters ?? [];
    const args =
      objectFlags & ts.ObjectFlags.Reference
        ? this.checker.getTypeArguments(type as ts.TypeReference)
        : [];
    const params = typeParameters.flatMap((parameter, i) =>
      parameter.symbol && this.keptConstraints(parameter.symbol)
        ? [args[i] ? this.map(args[i]) : DYNAMIC]
        : [],
    );
    return { kind: 'path', path, params };
  }

  /** The typedef a named, non-generic project interface or alias refers to. */
  private typedefReference(type: ts.Type): HxTypePath | undefined {
    if (type.aliasSymbol) {
      return type.aliasTypeArguments
        ? undefined
        : this.typedefPath(type.aliasSymbol);
    }
    const objectFlags = (type as ts.ObjectType).objectFlags ?? 0;
    if (
      type.symbol &&
      objectFlags & ts.ObjectFlags.Interface &&
      type.symbol.flags & ts.SymbolFlags.Interface
    ) {
      return this.typedefPath(type.symbol);
    }
    return undefined;
  }

  /** Value type of a dictionary: a single string or number index signature and nothing else. */
  dictValueType(type: ts.Type): ts.Type | undefined {
    if (
      type.isUnion() ||
      !(type.flags & (ts.TypeFlags.Object | ts.TypeFlags.Intersection)) ||
      this.checker.isArrayLikeType(type) ||
      this.checker.getPropertiesOfType(type).length > 0 ||
      type.getCallSignatures().length > 0 ||
      type.getConstructSignatures().length > 0
    ) {
      return undefined;
    }
    const infos = this.checker.getIndexInfosOfType(type);
    const [info] = infos;
    return infos.length === 1 &&
      info.keyType.flags & (ts.TypeFlags.String | ts.TypeFlags.Number)
      ? info.type
      : undefined;
  }

  /** Whether `type` is an object shape an anonymous Haxe structure can describe. */
  private isStructure(type: ts.Type): boolean {
    if (type.isIntersection()) {
      return type.types.every((t) => this.isStructure(t));
    }
    if (
      !(type.flags & ts.TypeFlags.Object) ||
      this.checker.isArrayLikeType(type) ||
      type.getCallSignatures().length > 0 ||
      type.getConstructSignatures().length > 0 ||
      this.checker.getIndexInfosOfType(type).length > 0
    ) {
      return false;
    }
    const objectFlags = (type as ts.ObjectType).objectFlags;
    if (objectFlags & ts.ObjectFlags.Mapped) {
      return true;
    }
    const symbol = type.symbol;
    if (
      !symbol ||
      !(
        symbol.flags &
        (ts.SymbolFlags.TypeLiteral |
          ts.SymbolFlags.ObjectLiteral |
          ts.SymbolFlags.Interface)
      ) ||
      symbol.flags & ts.SymbolFlags.Class
    ) {
      return false;
    }
    return !(
      symbol.flags & ts.SymbolFlags.Interface &&
      !(symbol.flags & ts.SymbolFlags.TypeLiteral) &&
      isLibSymbol(symbol)
    );
  }

  /** The anonymous structure of an object, intersection or mapped type. */
  private structure(type: ts.Type): HxType {
    const fields: HxAnonField[] = this.checker
      .getPropertiesOfType(type)
      .map((property) => {
        const optional = (property.flags & ts.SymbolFlags.Optional) !== 0;
        const propertyType = this.checker.getTypeOfSymbol(property);
        const method =
          !optional &&
          (property.declarations ?? []).length > 0 &&
          (property.declarations ?? []).every(
            (d) => ts.isMethodSignature(d) || ts.isMethodDeclaration(d),
          ) &&
          propertyType.getCallSignatures().length === 1;
        const mapped = method
          ? this.signatureType(propertyType.getCallSignatures()[0])
          : this.map(propertyType);
        return {
          name: escapeIdentifier(property.name),
          type: optional ? nullable(mapped) : mapped,
          optional,
          readonly: isReadonly(property) || undefined,
          method: method || undefined,
        };
      });
    return { kind: 'anon', fields };
  }

  /** Haxe function type of a call signature. */
  signatureType(signature: ts.Signature): HxType {
    const erased = (signature.typeParameters ?? []).flatMap((p) =>
      p.symbol && !this.erasedSignatureParams.has(p.symbol) ? [p.symbol] : [],
    );
    erased.forEach((symbol) => this.erasedSignatureParams.add(symbol));
    try {
      return this.signatureTypeUncached(signature);
    } finally {
      erased.forEach((symbol) => this.erasedSignatureParams.delete(symbol));
    }
  }

  private signatureTypeUncached(signature: ts.Signature): HxType {
    return {
      kind: 'fn',
      args: signature.parameters.map((parameter) => {
        const declaration = parameter.valueDeclaration;
        const rest =
          declaration !== undefined &&
          ts.isParameter(declaration) &&
          declaration.dotDotDotToken !== undefined;
        const parameterType = this.checker.getTypeOfSymbol(parameter);
        return {
          name: escapeIdentifier(parameter.name),
          type: rest
            ? this.elementType(parameterType)
            : this.map(parameterType),
          optional:
            declaration !== undefined &&
            ts.isParameter(declaration) &&
            (declaration.questionToken !== undefined ||
              declaration.initializer !== undefined),
          rest,
        };
      }),
      ret: this.mapReturn(signature.getReturnType()),
    };
  }

  /** Element type of an array type (rest parameters, spreads). */
  elementType(type: ts.Type): HxType {
    if (this.checker.isArrayType(type)) {
      const [element] = this.checker.getTypeArguments(type as ts.TypeReference);
      return element ? this.map(element) : DYNAMIC;
    }
    return DYNAMIC;
  }
}

/** Whether Haxe can declare type parameters on the class or function `node` becomes. */
function isHaxeGenericDeclaration(node: ts.Node): boolean {
  return (
    ts.isClassLike(node) ||
    ts.isFunctionDeclaration(node) ||
    (ts.isMethodDeclaration(node) && ts.isClassLike(node.parent))
  );
}

function isPrimitivePath(path: HxTypePath): boolean {
  return (
    path.pack.length === 0 &&
    ['Float', 'Int', 'Bool', 'String'].includes(path.name)
  );
}

function isReadonly(property: ts.Symbol): boolean {
  const checkFlags =
    (property as { links?: { checkFlags?: number } }).links?.checkFlags ?? 0;
  if (checkFlags & CHECK_FLAGS_READONLY) {
    return true;
  }
  const declarations = property.declarations ?? [];
  return (
    declarations.length > 0 &&
    declarations.every(
      (d) =>
        (ts.isPropertySignature(d) || ts.isPropertyDeclaration(d)) &&
        (ts.getCombinedModifierFlags(d) & ts.ModifierFlags.Readonly) !== 0,
    )
  );
}

function isLibSymbol(symbol: ts.Symbol): boolean {
  return (symbol.declarations ?? []).some((d) => {
    const file = d.getSourceFile();
    return (
      file.hasNoDefaultLib ||
      /[\\/]typescript[\\/]lib[\\/]/.test(file.fileName) ||
      /[\\/]@types[\\/]/.test(file.fileName)
    );
  });
}

function pathKey(path: HxTypePath): string {
  return [...path.pack, path.module, path.name].join('.');
}
