import {
  BOOL,
  constExpr,
  DYNAMIC,
  INT,
  localExpr,
  sameType,
  VOID,
} from '../ir/builders';
import type {
  HxCatch,
  HxExpr,
  HxFunction,
  HxModule,
  HxPass,
  HxStmt,
  HxType,
  PassContext,
} from '../ir/types';
import { transformModule } from '../ir/walk';
import { exits } from './lower-control-flow';

type TryFinally = Extract<HxStmt, { kind: 'tryFinally' }>;
type Jump = Extract<
  HxStmt,
  {
    kind: 'return' | 'break' | 'continue' | 'labeledBreak' | 'labeledContinue';
  }
>;

/** The jumps a statement list owns: those to loops, switches and labels inside it. */
interface Inner {
  breaks: boolean;
  continues: boolean;
  labels: ReadonlySet<string>;
}

const OUTERMOST: Inner = { breaks: false, continues: false, labels: new Set() };

/** Completion code of a throw out of the `try` or `catch` (ECMA-262 completion records). */
const THROW_CODE = 1;

function intConst(value: number): HxExpr {
  return { kind: 'const', value, int: true, type: INT };
}

function assign(name: string, type: HxType, value: HxExpr): HxStmt {
  return {
    kind: 'expr',
    expr: {
      kind: 'assign',
      op: '=',
      target: localExpr(name, type),
      value,
      type,
    },
  };
}

function jumpKey(jump: Jump): string {
  switch (jump.kind) {
    case 'labeledBreak':
    case 'labeledContinue':
      return `${jump.kind} ${jump.label}`;
    default:
      return jump.kind;
  }
}

function escapes(jump: Jump, inner: Inner): boolean {
  switch (jump.kind) {
    case 'return':
      return true;
    case 'break':
      return !inner.breaks;
    case 'continue':
      return !inner.continues;
    case 'labeledBreak':
    case 'labeledContinue':
      return !inner.labels.has(jump.label);
  }
}

/**
 * Lowers one `try`/`catch`/`finally` of a function returning `ret` (ADR 0005).
 * Each jump out of the `try` or `catch` block records a completion code (and
 * the returned value) and leaves the block through a labelled break; a throw
 * is caught and recorded the same way. The `finally` block runs next, then the
 * recorded completion is resumed. Jumps inside `finally` stay as they are, so
 * they override the pending completion like in JS.
 */
class FinallyLowering {
  private readonly codes = new Map<string, { code: number; jump: Jump }>();
  private readonly completion: string;
  private readonly result: string;
  private readonly error: string;
  private readonly resultType: HxType;
  private hasResult = false;

  constructor(
    private readonly context: PassContext,
    private readonly ret: HxType,
  ) {
    this.completion = context.freshName('completion');
    this.result = context.freshName('result');
    this.error = context.freshName('error');
    this.resultType =
      ret.kind === 'null' || ret.kind === 'dynamic'
        ? ret
        : { kind: 'null', inner: ret };
  }

  lower(stmt: TryFinally): HxStmt[] {
    const guarded: HxStmt[] = stmt.catch
      ? [
          {
            kind: 'try',
            body: stmt.body,
            catches: [{ ...stmt.catch, type: DYNAMIC }],
          },
        ]
      : stmt.body;
    const body = this.exitable(guarded);
    const handler = this.recordThrow();
    const declarations: HxStmt[] = [
      {
        kind: 'var',
        name: this.completion,
        final: false,
        type: INT,
        init: intConst(0),
      },
      {
        kind: 'var',
        name: this.error,
        final: false,
        type: DYNAMIC,
        init: constExpr(null),
      },
    ];
    if (this.hasResult) {
      declarations.push({
        kind: 'var',
        name: this.result,
        final: false,
        type: this.resultType,
        init: constExpr(null),
      });
    }
    return [
      {
        kind: 'block',
        body: [
          ...declarations,
          { kind: 'try', body, catches: [handler] },
          ...stmt.finally,
          ...this.resume(),
        ],
      },
    ];
  }

  private recordThrow(): HxCatch {
    const name = this.context.freshName('thrown');
    return {
      name,
      type: DYNAMIC,
      finalizer: true,
      body: [
        assign(this.error, DYNAMIC, localExpr(name, DYNAMIC)),
        assign(this.completion, INT, intConst(THROW_CODE)),
      ],
    };
  }

  /** `stmts` with their escaping jumps recorded, inside a labelled block they break out of. */
  private exitable(stmts: HxStmt[]): HxStmt[] {
    const label = this.context.freshName('finally');
    let escaped = false;
    const body = this.rewrite(stmts, OUTERMOST, (jump) => {
      escaped = true;
      return this.record(jump, label);
    });
    return escaped
      ? [{ kind: 'labeled', label, body: { kind: 'block', body } }]
      : body;
  }

  private record(jump: Jump, label: string): HxStmt[] {
    const key = jumpKey(jump);
    let entry = this.codes.get(key);
    if (!entry) {
      entry = { code: THROW_CODE + 1 + this.codes.size, jump };
      this.codes.set(key, entry);
    }
    const stmts: HxStmt[] = [];
    if (jump.kind === 'return' && jump.value) {
      this.hasResult = true;
      stmts.push(assign(this.result, this.resultType, jump.value));
    }
    stmts.push(assign(this.completion, INT, intConst(entry.code)));
    stmts.push({ kind: 'labeledBreak', label });
    return stmts;
  }

  /** Resumes the recorded completion after `finally`: rethrow, return or jump. */
  private resume(): HxStmt[] {
    const branches: Array<{ code: number; then: HxStmt[] }> = [
      {
        code: THROW_CODE,
        then: [{ kind: 'throw', value: localExpr(this.error, DYNAMIC) }],
      },
      ...[...this.codes.values()].map(({ code, jump }) => ({
        code,
        then: [this.resumed(jump)],
      })),
    ];
    return branches.reduceRight<HxStmt[]>(
      (otherwise, branch) => [
        {
          kind: 'if',
          cond: {
            kind: 'binop',
            op: '==',
            left: localExpr(this.completion, INT),
            right: intConst(branch.code),
            type: BOOL,
          },
          then: branch.then,
          else: otherwise.length > 0 ? otherwise : undefined,
        },
      ],
      [],
    );
  }

  private resumed(jump: Jump): HxStmt {
    if (jump.kind !== 'return') {
      return jump;
    }
    return jump.value && !sameType(this.ret, VOID)
      ? { kind: 'return', value: localExpr(this.result, this.resultType) }
      : { kind: 'return' };
  }

  /** Replaces the jumps leaving `stmts` (functions own theirs). */
  private rewrite(
    stmts: HxStmt[],
    inner: Inner,
    replace: (jump: Jump) => HxStmt[],
  ): HxStmt[] {
    const recurse = (body: HxStmt[], scope: Inner = inner) =>
      this.rewrite(body, scope, replace);
    return stmts.flatMap((stmt): HxStmt[] => {
      switch (stmt.kind) {
        case 'return':
        case 'break':
        case 'continue':
        case 'labeledBreak':
        case 'labeledContinue':
          return escapes(stmt, inner) ? replace(stmt) : [stmt];
        case 'block':
          return [{ ...stmt, body: recurse(stmt.body) }];
        case 'if':
          return [
            {
              ...stmt,
              then: recurse(stmt.then),
              else: stmt.else && recurse(stmt.else),
            },
          ];
        case 'switch':
          return [
            {
              ...stmt,
              cases: stmt.cases.map((c) => ({ ...c, body: recurse(c.body) })),
              default: stmt.default && recurse(stmt.default),
            },
          ];
        case 'try':
          return [
            {
              ...stmt,
              body: recurse(stmt.body),
              catches: stmt.catches.map((c) => ({
                ...c,
                body: recurse(c.body),
              })),
            },
          ];
        case 'while':
        case 'forIn':
        case 'cFor':
          return [
            {
              ...stmt,
              body: recurse(stmt.body, {
                ...inner,
                breaks: true,
                continues: true,
              }),
            },
          ];
        case 'tsSwitch':
          return [
            {
              ...stmt,
              clauses: stmt.clauses.map((c) => ({
                ...c,
                body: recurse(c.body, { ...inner, breaks: true }),
              })),
            },
          ];
        case 'labeled': {
          const [body] = recurse([stmt.body], {
            ...inner,
            labels: new Set([...inner.labels, stmt.label]),
          });
          return [{ ...stmt, body }];
        }
        default:
          return [stmt];
      }
    });
  }
}

/** Lowers the `tryFinally`s of a statement list, innermost first; nested functions are left alone. */
function lowerStmts(
  stmts: HxStmt[],
  ret: HxType,
  context: PassContext,
  lowered: { any: boolean },
): HxStmt[] {
  const recurse = (body: HxStmt[]) => lowerStmts(body, ret, context, lowered);
  return stmts.flatMap((stmt): HxStmt[] => {
    switch (stmt.kind) {
      case 'tryFinally':
        lowered.any = true;
        return new FinallyLowering(context, ret).lower({
          ...stmt,
          body: recurse(stmt.body),
          catch: stmt.catch && {
            ...stmt.catch,
            body: recurse(stmt.catch.body),
          },
          finally: recurse(stmt.finally),
        });
      case 'block':
        return [{ ...stmt, body: recurse(stmt.body) }];
      case 'if':
        return [
          {
            ...stmt,
            then: recurse(stmt.then),
            else: stmt.else && recurse(stmt.else),
          },
        ];
      case 'switch':
        return [
          {
            ...stmt,
            cases: stmt.cases.map((c) => ({ ...c, body: recurse(c.body) })),
            default: stmt.default && recurse(stmt.default),
          },
        ];
      case 'try':
        return [
          {
            ...stmt,
            body: recurse(stmt.body),
            catches: stmt.catches.map((c) => ({ ...c, body: recurse(c.body) })),
          },
        ];
      case 'while':
      case 'forIn':
        return [{ ...stmt, body: recurse(stmt.body) }];
      case 'cFor':
        return [
          { ...stmt, init: recurse(stmt.init), body: recurse(stmt.body) },
        ];
      case 'tsSwitch':
        return [
          {
            ...stmt,
            clauses: stmt.clauses.map((c) => ({ ...c, body: recurse(c.body) })),
          },
        ];
      case 'labeled': {
        const [body] = recurse([stmt.body]);
        return [{ ...stmt, body }];
      }
      default:
        return [stmt];
    }
  });
}

/** Lowers a function body; a value function now ending in a resumption gets a terminator. */
function lowerBody(
  body: HxStmt[],
  ret: HxType,
  context: PassContext,
): HxStmt[] {
  const lowered = { any: false };
  const result = lowerStmts(body, ret, context, lowered);
  return lowered.any && !sameType(ret, VOID) && !exits(result)
    ? [...result, { kind: 'throw', value: constExpr('unreachable') }]
    : result;
}

function lowerFunction(fn: HxFunction, context: PassContext): HxFunction {
  return fn.body ? { ...fn, body: lowerBody(fn.body, fn.ret, context) } : fn;
}

/**
 * Lowers `finally` (ADR 0005), which Haxe lacks, into `try`/`catch` plus a
 * recorded completion. Runs before `lowerControlFlow`, which lowers the
 * labelled blocks and the jumps it leaves.
 */
export const lowerFinally: HxPass = (module: HxModule, context) => {
  const nested = transformModule(module, {
    expr: (expr) =>
      expr.kind === 'fn'
        ? { ...expr, fn: lowerFunction(expr.fn, context) }
        : expr,
    stmts: (stmts) =>
      stmts.map((stmt) =>
        stmt.kind === 'localFunction'
          ? { ...stmt, fn: lowerFunction(stmt.fn, context) }
          : stmt,
      ),
  });
  return {
    ...nested,
    decls: nested.decls.map((decl) => {
      switch (decl.kind) {
        case 'moduleFunction':
          return { ...decl, fn: lowerFunction(decl.fn, context) };
        case 'class':
          return {
            ...decl,
            fields: decl.fields.map((field) =>
              field.kind === 'method'
                ? { ...field, fn: lowerFunction(field.fn, context) }
                : field,
            ),
          };
        default:
          return decl;
      }
    }),
    init: lowerBody(nested.init, VOID, context),
  };
};
