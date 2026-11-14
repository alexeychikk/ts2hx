/**
 * Typed Haxe IR — the contract between the frontend, the lowering passes and
 * the printer (see docs/decisions/0001-rewrite-as-typed-ir-compiler.md).
 *
 * The frontend produces it from the TS AST + checker; passes rewrite it until
 * only `HxStmt` kinds Haxe can express remain (`LoweredStmt`); the printer
 * turns it into Haxe source. Every expression carries its Haxe type so passes
 * can create typed temporaries and the printer never has to guess.
 */

export interface SourcePos {
  file: string;
  line: number;
  column: number;
}

/** Fully qualified Haxe type path: `pack.Module.Name` (Name === Module for the main type). */
export interface HxTypePath {
  pack: string[];
  module: string;
  name: string;
}

export type HxType =
  | { kind: 'path'; path: HxTypePath; params: HxType[] }
  | { kind: 'typeParam'; name: string }
  | { kind: 'fn'; args: HxFnArgType[]; ret: HxType }
  | { kind: 'anon'; fields: HxAnonField[] }
  | { kind: 'null'; inner: HxType }
  | { kind: 'dynamic' };

export interface HxFnArgType {
  name?: string;
  type: HxType;
  optional?: boolean;
  rest?: boolean;
}

export interface HxAnonField {
  name: string;
  type: HxType;
  optional?: boolean;
  readonly?: boolean;
  /** Printed as `function name(...):R;` — required for class instances to unify. */
  method?: boolean;
}

export interface HxTypeParam {
  name: string;
  constraints: HxType[];
}

interface ExprBase {
  type: HxType;
  pos?: SourcePos;
}

export type HxBinop =
  | '+'
  | '-'
  | '*'
  | '/'
  | '%'
  | '=='
  | '!='
  | '<'
  | '<='
  | '>'
  | '>='
  | '&&'
  | '||'
  | '??'
  | '&'
  | '|'
  | '^'
  | '<<'
  | '>>'
  | '>>>';

export type HxAssignOp = '=' | '+=' | '-=' | '*=' | '/=' | '%=' | '??=';

export type HxUnop = '!' | '-' | '~' | '++' | '--';

export type HxExpr =
  | (ExprBase & {
      kind: 'const';
      value: number | string | boolean | null;
      int?: boolean;
    })
  | (ExprBase & { kind: 'local'; name: string })
  | (ExprBase & { kind: 'this' })
  | (ExprBase & { kind: 'super' })
  | (ExprBase & { kind: 'typeRef'; path: HxTypePath })
  | (ExprBase & { kind: 'field'; target: HxExpr; name: string; safe?: boolean })
  | (ExprBase & { kind: 'staticField'; owner: HxTypePath; name: string })
  | (ExprBase & { kind: 'moduleField'; module: HxTypePath; name: string })
  | (ExprBase & { kind: 'index'; target: HxExpr; index: HxExpr })
  | (ExprBase & {
      kind: 'call';
      callee: HxExpr;
      args: HxExpr[];
      spreadLast?: boolean;
    })
  | (ExprBase & {
      kind: 'new';
      path: HxTypePath;
      typeArgs: HxType[];
      args: HxExpr[];
    })
  | (ExprBase & { kind: 'binop'; op: HxBinop; left: HxExpr; right: HxExpr })
  | (ExprBase & { kind: 'unop'; op: HxUnop; postfix: boolean; operand: HxExpr })
  | (ExprBase & {
      kind: 'assign';
      op: HxAssignOp;
      target: HxExpr;
      value: HxExpr;
    })
  | (ExprBase & { kind: 'ternary'; cond: HxExpr; then: HxExpr; else: HxExpr })
  | (ExprBase & { kind: 'arrayLit'; elements: HxExpr[] })
  | (ExprBase & {
      kind: 'objectLit';
      fields: Array<{ name: string; value: HxExpr }>;
    })
  | (ExprBase & { kind: 'fn'; fn: HxFunction })
  | (ExprBase & { kind: 'cast'; expr: HxExpr; checked: boolean })
  | (ExprBase & { kind: 'isOfType'; expr: HxExpr; path: HxTypePath })
  | (ExprBase & { kind: 'blockExpr'; stmts: HxStmt[]; result: HxExpr })
  | (ExprBase & { kind: 'unsupported'; message: string; source: string })
  /** Removed by the generator/async pass. */
  | (ExprBase & { kind: 'yield'; value?: HxExpr; delegate: boolean })
  | (ExprBase & { kind: 'await'; value: HxExpr });

export interface HxParam {
  name: string;
  type: HxType;
  optional?: boolean;
  rest?: boolean;
  /** Only Haxe-constant defaults; others are lowered into the body by the frontend. */
  defaultValue?: HxExpr;
}

export interface HxFunction {
  typeParams: HxTypeParam[];
  params: HxParam[];
  ret: HxType;
  body?: HxStmt[];
  isGenerator?: boolean;
  isAsync?: boolean;
}

export interface HxCatch {
  name: string;
  type: HxType;
  body: HxStmt[];
}

/** Statements Haxe can express directly — the only kinds the printer accepts. */
export type LoweredStmt =
  | { kind: 'expr'; expr: HxExpr }
  | { kind: 'var'; name: string; final: boolean; type?: HxType; init?: HxExpr }
  | { kind: 'localFunction'; name: string; fn: HxFunction }
  | { kind: 'block'; body: HxStmt[] }
  | { kind: 'if'; cond: HxExpr; then: HxStmt[]; else?: HxStmt[] }
  | { kind: 'while'; cond: HxExpr; body: HxStmt[]; doWhile: boolean }
  | { kind: 'forIn'; name: string; iterable: HxExpr; body: HxStmt[] }
  | {
      kind: 'switch';
      subject: HxExpr;
      cases: Array<{ values: HxExpr[]; body: HxStmt[] }>;
      default?: HxStmt[];
    }
  | { kind: 'try'; body: HxStmt[]; catches: HxCatch[] }
  | { kind: 'return'; value?: HxExpr }
  | { kind: 'break' }
  | { kind: 'continue' }
  | { kind: 'throw'; value: HxExpr }
  | { kind: 'comment'; text: string; todo: boolean };

/** TS control flow the frontend emits verbatim; each kind is removed by a pass. */
export type UnloweredStmt =
  | { kind: 'labeled'; label: string; body: HxStmt }
  | { kind: 'labeledBreak'; label: string }
  | { kind: 'labeledContinue'; label: string }
  | {
      kind: 'cFor';
      init: HxStmt[];
      cond?: HxExpr;
      update: HxExpr[];
      body: HxStmt[];
      /** Loop-scoped `let`s captured by closures in the body — need a per-iteration copy. */
      perIterationBindings: string[];
    }
  | {
      /**
       * A JS `switch`: `subject` is declared once as `final name = value`
       * before the tests run; each `test` is the clause's `Bool` match against
       * it (absent for `default`). Bodies fall through; `break` exits.
       */
      kind: 'tsSwitch';
      subject?: { name: string; value: HxExpr };
      clauses: Array<{ test?: HxExpr; body: HxStmt[] }>;
    }
  | { kind: 'tryFinally'; body: HxStmt[]; catch?: HxCatch; finally: HxStmt[] };

export type HxStmt = LoweredStmt | UnloweredStmt;

export type HxAccess = 'public' | 'private';

export type HxClassField =
  | {
      kind: 'var';
      name: string;
      access: HxAccess;
      isStatic: boolean;
      final: boolean;
      type: HxType;
      init?: HxExpr;
    }
  | {
      kind: 'property';
      name: string;
      access: HxAccess;
      isStatic: boolean;
      get: 'get' | 'null' | 'never' | 'default';
      set: 'set' | 'null' | 'never' | 'default';
      isVar: boolean;
      type: HxType;
    }
  | {
      kind: 'method';
      name: string;
      access: HxAccess;
      isStatic: boolean;
      isOverride: boolean;
      isAbstract: boolean;
      fn: HxFunction;
    };

export type HxDecl =
  | {
      kind: 'class';
      name: string;
      typeParams: HxTypeParam[];
      isAbstract: boolean;
      superClass?: { path: HxTypePath; params: HxType[] };
      fields: HxClassField[];
      meta: string[];
    }
  | { kind: 'typedef'; name: string; typeParams: HxTypeParam[]; type: HxType }
  | {
      kind: 'enumAbstract';
      name: string;
      underlying: HxType;
      members: Array<{ name: string; value: HxExpr }>;
    }
  | {
      kind: 'moduleVar';
      name: string;
      final: boolean;
      type: HxType;
      init?: HxExpr;
    }
  | { kind: 'moduleFunction'; name: string; fn: HxFunction };

/** One generated `.hx` file. */
export interface HxModule {
  pack: string[];
  name: string;
  /** TS source this module was produced from (for diagnostics and the init order). */
  sourceFile: string;
  imports: HxTypePath[];
  decls: HxDecl[];
  /** Body of the generated `__init()` — top-level statements and non-constant initialisers, in TS order. */
  init: HxStmt[];
}

export type HxPass = (module: HxModule, context: PassContext) => HxModule;

export interface PassContext {
  /** Fresh, collision-free local name (`__tmp1`, ...). */
  freshName: (hint: string) => string;
  reportUnsupported: (message: string, pos?: SourcePos) => void;
}
