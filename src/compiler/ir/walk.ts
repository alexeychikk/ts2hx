import type {
  HxCatch,
  HxClassField,
  HxDecl,
  HxExpr,
  HxFunction,
  HxModule,
  HxStmt,
} from './types';

/** Bottom-up rewrites applied to every expression and every statement list of the IR. */
export interface IrTransform {
  expr?: (expr: HxExpr) => HxExpr;
  stmts?: (stmts: HxStmt[]) => HxStmt[];
}

export function transformModule(
  module: HxModule,
  transform: IrTransform,
): HxModule {
  return {
    ...module,
    decls: module.decls.map((d) => transformDecl(d, transform)),
    init: transformStmts(module.init, transform),
  };
}

function transformDecl(decl: HxDecl, transform: IrTransform): HxDecl {
  switch (decl.kind) {
    case 'moduleVar':
      return decl.init
        ? { ...decl, init: transformExpr(decl.init, transform) }
        : decl;
    case 'moduleFunction':
      return { ...decl, fn: transformFunction(decl.fn, transform) };
    case 'class':
      return {
        ...decl,
        fields: decl.fields.map((f) => transformField(f, transform)),
      };
    case 'enumAbstract':
      return {
        ...decl,
        members: decl.members.map((m) => ({
          ...m,
          value: transformExpr(m.value, transform),
        })),
      };
    case 'typedef':
      return decl;
  }
}

function transformField(
  field: HxClassField,
  transform: IrTransform,
): HxClassField {
  switch (field.kind) {
    case 'var':
      return field.init
        ? { ...field, init: transformExpr(field.init, transform) }
        : field;
    case 'method':
      return { ...field, fn: transformFunction(field.fn, transform) };
    case 'property':
      return field;
  }
}

export function transformFunction(
  fn: HxFunction,
  transform: IrTransform,
): HxFunction {
  return {
    ...fn,
    params: fn.params.map((p) =>
      p.defaultValue
        ? { ...p, defaultValue: transformExpr(p.defaultValue, transform) }
        : p,
    ),
    body: fn.body && transformStmts(fn.body, transform),
  };
}

export function transformStmts(
  stmts: HxStmt[],
  transform: IrTransform,
): HxStmt[] {
  const children = stmts.map((s) => transformStmt(s, transform));
  return transform.stmts ? transform.stmts(children) : children;
}

function transformCatch(c: HxCatch, transform: IrTransform): HxCatch {
  return { ...c, body: transformStmts(c.body, transform) };
}

function transformStmt(stmt: HxStmt, transform: IrTransform): HxStmt {
  const e = (expr: HxExpr) => transformExpr(expr, transform);
  const s = (body: HxStmt[]) => transformStmts(body, transform);
  switch (stmt.kind) {
    case 'expr':
      return { ...stmt, expr: e(stmt.expr) };
    case 'var':
      return stmt.init ? { ...stmt, init: e(stmt.init) } : stmt;
    case 'localFunction':
      return { ...stmt, fn: transformFunction(stmt.fn, transform) };
    case 'block':
      return { ...stmt, body: s(stmt.body) };
    case 'if':
      return {
        ...stmt,
        cond: e(stmt.cond),
        then: s(stmt.then),
        else: stmt.else && s(stmt.else),
      };
    case 'while':
      return { ...stmt, cond: e(stmt.cond), body: s(stmt.body) };
    case 'forIn':
      return { ...stmt, iterable: e(stmt.iterable), body: s(stmt.body) };
    case 'switch':
      return {
        ...stmt,
        subject: e(stmt.subject),
        cases: stmt.cases.map((c) => ({
          values: c.values.map(e),
          body: s(c.body),
        })),
        default: stmt.default && s(stmt.default),
      };
    case 'try':
      return {
        ...stmt,
        body: s(stmt.body),
        catches: stmt.catches.map((c) => transformCatch(c, transform)),
      };
    case 'return':
      return stmt.value ? { ...stmt, value: e(stmt.value) } : stmt;
    case 'throw':
      return { ...stmt, value: e(stmt.value) };
    case 'labeled': {
      const [body] = s([stmt.body]);
      return { ...stmt, body };
    }
    case 'cFor':
      return {
        ...stmt,
        init: s(stmt.init),
        cond: stmt.cond && e(stmt.cond),
        update: stmt.update.map(e),
        body: s(stmt.body),
      };
    case 'tsSwitch':
      return {
        ...stmt,
        subject: e(stmt.subject),
        clauses: stmt.clauses.map((c) => ({
          test: c.test && e(c.test),
          body: s(c.body),
        })),
      };
    case 'tryFinally':
      return {
        ...stmt,
        body: s(stmt.body),
        catch: stmt.catch && transformCatch(stmt.catch, transform),
        finally: s(stmt.finally),
      };
    case 'break':
    case 'continue':
    case 'labeledBreak':
    case 'labeledContinue':
    case 'comment':
      return stmt;
  }
}

export function transformExpr(expr: HxExpr, transform: IrTransform): HxExpr {
  const e = (child: HxExpr) => transformExpr(child, transform);
  let result: HxExpr;
  switch (expr.kind) {
    case 'field':
      result = { ...expr, target: e(expr.target) };
      break;
    case 'index':
      result = { ...expr, target: e(expr.target), index: e(expr.index) };
      break;
    case 'call':
      result = { ...expr, callee: e(expr.callee), args: expr.args.map(e) };
      break;
    case 'new':
      result = { ...expr, args: expr.args.map(e) };
      break;
    case 'binop':
      result = { ...expr, left: e(expr.left), right: e(expr.right) };
      break;
    case 'unop':
      result = { ...expr, operand: e(expr.operand) };
      break;
    case 'assign':
      result = { ...expr, target: e(expr.target), value: e(expr.value) };
      break;
    case 'ternary':
      result = {
        ...expr,
        cond: e(expr.cond),
        then: e(expr.then),
        else: e(expr.else),
      };
      break;
    case 'arrayLit':
      result = { ...expr, elements: expr.elements.map(e) };
      break;
    case 'objectLit':
      result = {
        ...expr,
        fields: expr.fields.map((f) => ({ ...f, value: e(f.value) })),
      };
      break;
    case 'fn':
      result = { ...expr, fn: transformFunction(expr.fn, transform) };
      break;
    case 'cast':
    case 'isOfType':
      result = { ...expr, expr: e(expr.expr) };
      break;
    case 'blockExpr':
      result = {
        ...expr,
        stmts: transformStmts(expr.stmts, transform),
        result: e(expr.result),
      };
      break;
    case 'yield':
      result = expr.value ? { ...expr, value: e(expr.value) } : expr;
      break;
    case 'await':
      result = { ...expr, value: e(expr.value) };
      break;
    default:
      result = expr;
  }
  return transform.expr ? transform.expr(result) : result;
}
