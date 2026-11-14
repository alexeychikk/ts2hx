import ts from 'typescript';

import {
  BOOL,
  constExpr,
  DYNAMIC,
  FLOAT,
  localExpr,
  STRING,
} from '../ir/builders';
import type { HxClassField, HxDecl, HxStmt, HxType } from '../ir/types';
import { enumMemberKey, type StaticMember } from '../model/project-model';

export type EnumValue = string | number;

export interface EnumMemberValue {
  member: ts.EnumMember;
  /** The member's JS property key. */
  key: string;
  /** Its constant value; `undefined` for a computed member. */
  value: EnumValue | undefined;
}

/** The members of every declaration of an enum, in source order, with their constant values. */
export function enumMembers(
  symbol: ts.Symbol,
  checker: ts.TypeChecker,
): EnumMemberValue[] {
  return (symbol.declarations ?? [])
    .filter(ts.isEnumDeclaration)
    .flatMap((declaration) => declaration.members)
    .flatMap((member) => {
      const key = enumMemberKey(member);
      return key === undefined
        ? []
        : [{ member, key, value: checker.getConstantValue(member) }];
    });
}

/**
 * The properties of an enum's runtime object in JS enumeration order: each member, and
 * for a numeric one its reverse mapping (`E[E["A"] = 0] = "A"`).
 */
export function enumObjectEntries(
  members: readonly EnumMemberValue[],
): Array<[string, EnumValue]> {
  const object: Record<string, EnumValue> = {};
  for (const { key, value } of members) {
    if (value === undefined) continue;
    object[key] = value;
    if (typeof value === 'number') {
      object[String(value)] = key;
    }
  }
  return Object.entries(object);
}

/** Name of the generated reverse-mapping static: `name`, unless a member took it. */
export function reverseMappingName(memberNames: Iterable<string>): string {
  const taken = new Set(memberNames);
  let name = 'name';
  for (let n = 2; taken.has(name); n++) {
    name = `name_${n}`;
  }
  return name;
}

/** Haxe type of an enum's values: `Float`, `String`, or `Dynamic` for a heterogeneous enum. */
export function enumUnderlyingType(
  members: readonly EnumMemberValue[],
): HxType {
  const kinds = new Set(
    members.filter((m) => m.value !== undefined).map((m) => typeof m.value),
  );
  return kinds.size > 1 ? DYNAMIC : kinds.has('string') ? STRING : FLOAT;
}

/**
 * The `enum abstract` of an enum (ADR 0005): its constant members, plus a static
 * `name(value)` returning the member name of a numeric value, as `E[value]` does.
 * Computed members are left out; the caller reports them.
 */
export function enumAbstract(
  name: string,
  members: readonly EnumMemberValue[],
  statics: ReadonlyMap<ts.Node, StaticMember>,
): HxDecl {
  const constant = members.filter(
    (m): m is EnumMemberValue & { value: EnumValue } =>
      m.value !== undefined && statics.has(m.member),
  );
  const underlying = enumUnderlyingType(members);
  const memberNames = constant.map((m) => statics.get(m.member)!.name);
  const reverse = new Map<number, string>();
  for (const { key, value } of constant) {
    if (typeof value === 'number') reverse.set(value, key);
  }
  const fields: HxClassField[] = [];
  if (reverse.size > 0) {
    const value = localExpr('value', FLOAT);
    const body: HxStmt[] = [...reverse].map(([number, key]) => ({
      kind: 'if',
      cond: {
        kind: 'binop',
        op: '==',
        left: value,
        right: constExpr(number),
        type: BOOL,
      },
      then: [{ kind: 'return', value: constExpr(key) }],
    }));
    body.push({ kind: 'return', value: constExpr(null) });
    fields.push({
      kind: 'method',
      name: reverseMappingName(memberNames),
      access: 'public',
      isStatic: true,
      isOverride: false,
      isAbstract: false,
      fn: {
        typeParams: [],
        params: [{ name: 'value', type: FLOAT }],
        ret: STRING,
        body,
      },
    });
  }
  return {
    kind: 'enumAbstract',
    name,
    underlying,
    members: constant.map((m, i) => ({
      name: memberNames[i],
      value: constExpr(m.value),
    })),
    fields,
    todo:
      underlying.kind === 'dynamic'
        ? 'heterogeneous enum: values are Dynamic'
        : undefined,
  };
}
