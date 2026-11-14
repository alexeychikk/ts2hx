import ts from 'typescript';

import { BOOL, DYNAMIC, FLOAT, STRING, VOID } from '../ir/builders';
import type { HxAnonField, HxType } from '../ir/types';
import { escapeIdentifier } from '../model/names';

const NULLISH = ts.TypeFlags.Null | ts.TypeFlags.Undefined | ts.TypeFlags.Void;

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

/** Maps checker types to Haxe types: the single place doing so (ADR 0001). */
export class TypeMapper {
  private readonly visiting = new Set<ts.Type>();

  constructor(private readonly checker: ts.TypeChecker) {}

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

  private mapUncached(type: ts.Type): HxType {
    const flags = type.flags;
    if (flags & ts.TypeFlags.NumberLike) return FLOAT;
    if (flags & ts.TypeFlags.StringLike) return STRING;
    if (flags & ts.TypeFlags.BooleanLike) return BOOL;
    if (flags & ts.TypeFlags.TypeParameter) {
      return type.symbol
        ? { kind: 'typeParam', name: escapeIdentifier(type.symbol.name) }
        : DYNAMIC;
    }
    if (type.isUnion()) {
      return this.mapUnion(type);
    }
    if (flags & ts.TypeFlags.Object) {
      return this.mapObject(type as ts.ObjectType);
    }
    return DYNAMIC;
  }

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

  private mapObject(type: ts.ObjectType): HxType {
    if (this.checker.isArrayType(type)) {
      const [element] = this.checker.getTypeArguments(type as ts.TypeReference);
      return {
        kind: 'path',
        path: { pack: [], module: 'Array', name: 'Array' },
        params: [element ? this.map(element) : DYNAMIC],
      };
    }
    if (type.symbol && type.symbol.flags & ts.SymbolFlags.Class) {
      return DYNAMIC;
    }
    const properties = this.checker.getPropertiesOfType(type);
    const calls = type.getCallSignatures();
    if (calls.length === 1 && properties.length === 0) {
      return this.signatureType(calls[0]);
    }
    if (
      calls.length > 0 ||
      type.getConstructSignatures().length > 0 ||
      this.checker.getIndexInfosOfType(type).length > 0 ||
      !type.symbol ||
      !(
        type.symbol.flags &
        (ts.SymbolFlags.TypeLiteral |
          ts.SymbolFlags.ObjectLiteral |
          ts.SymbolFlags.Interface)
      ) ||
      (type.symbol.flags & ts.SymbolFlags.Interface &&
        !(type.symbol.flags & ts.SymbolFlags.TypeLiteral) &&
        isLibSymbol(type.symbol))
    ) {
      return DYNAMIC;
    }
    const fields: HxAnonField[] = properties.map((property) => {
      const optional = (property.flags & ts.SymbolFlags.Optional) !== 0;
      const propertyType = this.map(this.checker.getTypeOfSymbol(property));
      return {
        name: escapeIdentifier(property.name),
        type: optional ? nullable(propertyType) : propertyType,
        optional,
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
