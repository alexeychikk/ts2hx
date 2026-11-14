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
import type { HxAnonField, HxDecl, HxType, HxTypePath } from '../ir/types';
import { escapeIdentifier } from '../model/names';
import { ancestors } from './classes';

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

/** Haxe module path of a project source file, or `undefined` for lib and external files. */
export type ModulePathResolver = (
  sourceFile: ts.SourceFile,
) => HxTypePath | undefined;

type TypedefDeclaration = ts.InterfaceDeclaration | ts.TypeAliasDeclaration;

/** A Haxe type name for a TS interface or alias name: types must start upper-case. */
export function typedefName(name: string, moduleName: string): string {
  const escaped = escapeIdentifier(name);
  const capitalised = escaped[0].toUpperCase() + escaped.slice(1);
  return capitalised === moduleName ? `${capitalised}_` : capitalised;
}

/** The Haxe name of a project class: like a typedef, it must start upper-case. */
export function className(name: string, moduleName: string): string {
  return typedefName(name, moduleName);
}

/** Maps checker types to Haxe types: the single place doing so (ADR 0001). */
export class TypeMapper {
  private readonly visiting = new Set<ts.Type>();
  private readonly classDeclarations = new Map<string, ts.ClassDeclaration>();

  constructor(
    private readonly checker: ts.TypeChecker,
    private readonly modulePath: ModulePathResolver = () => undefined,
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
      name: typedefName(symbol.name, module.module),
    };
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
      return type.symbol
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
   * top level of a project module, merged at most with interfaces.
   */
  classPath(symbol: ts.Symbol): HxTypePath | undefined {
    const declarations = symbol.declarations ?? [];
    const declaration = declarations.find(ts.isClassDeclaration);
    if (
      !(symbol.flags & ts.SymbolFlags.Class) ||
      !declaration?.name ||
      !ts.isSourceFile(declaration.parent) ||
      declarations.some(
        (d) => d !== declaration && !ts.isInterfaceDeclaration(d),
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
      name: className(declaration.name.text, module.module),
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
    const arity = (target as ts.InterfaceType).typeParameters?.length ?? 0;
    const params =
      objectFlags & ts.ObjectFlags.Reference && arity > 0
        ? this.checker
            .getTypeArguments(type as ts.TypeReference)
            .slice(0, arity)
            .map((t) => this.map(t))
        : [];
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
