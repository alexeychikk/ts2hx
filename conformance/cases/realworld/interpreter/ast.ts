import { SourcePos } from './errors';

export type BinaryOp =
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
  | 'and'
  | 'or'
  | '..';

export type UnaryOp = '-' | 'not';

export interface NumberLit {
  type: 'number';
  value: number;
  pos: SourcePos;
}

export interface StringLit {
  type: 'string';
  value: string;
  pos: SourcePos;
}

export interface BoolLit {
  type: 'bool';
  value: boolean;
  pos: SourcePos;
}

export interface NilLit {
  type: 'nil';
  pos: SourcePos;
}

export interface Ident {
  type: 'ident';
  name: string;
  pos: SourcePos;
}

export interface ListLit {
  type: 'list';
  items: Expr[];
  pos: SourcePos;
}

export interface RecordLit {
  type: 'record';
  entries: Array<[string, Expr]>;
  pos: SourcePos;
}

export interface Unary {
  type: 'unary';
  op: UnaryOp;
  operand: Expr;
  pos: SourcePos;
}

export interface Binary {
  type: 'binary';
  op: BinaryOp;
  left: Expr;
  right: Expr;
  pos: SourcePos;
}

export interface Call {
  type: 'call';
  callee: Expr;
  args: Expr[];
  pos: SourcePos;
}

export interface Index {
  type: 'index';
  target: Expr;
  index: Expr;
  pos: SourcePos;
}

export interface Member {
  type: 'member';
  target: Expr;
  name: string;
  pos: SourcePos;
}

export interface Lambda {
  type: 'lambda';
  params: string[];
  body: Stmt[];
  name?: string;
  pos: SourcePos;
}

export interface IfExpr {
  type: 'if';
  cond: Expr;
  then: Expr;
  otherwise: Expr;
  pos: SourcePos;
}

export type Expr =
  | NumberLit
  | StringLit
  | BoolLit
  | NilLit
  | Ident
  | ListLit
  | RecordLit
  | Unary
  | Binary
  | Call
  | Index
  | Member
  | Lambda
  | IfExpr;

export interface LetStmt {
  type: 'let';
  name: string;
  init: Expr;
  pos: SourcePos;
}

export interface AssignStmt {
  type: 'assign';
  target: Ident | Index | Member;
  op: '=' | '+=' | '-=';
  value: Expr;
  pos: SourcePos;
}

export interface ExprStmt {
  type: 'expr';
  expr: Expr;
  pos: SourcePos;
}

export interface BlockStmt {
  type: 'block';
  body: Stmt[];
  pos: SourcePos;
}

export interface IfStmt {
  type: 'ifStmt';
  cond: Expr;
  then: BlockStmt;
  otherwise?: BlockStmt | IfStmt;
  pos: SourcePos;
}

export interface WhileStmt {
  type: 'while';
  cond: Expr;
  body: BlockStmt;
  pos: SourcePos;
}

export interface ForStmt {
  type: 'for';
  name: string;
  iterable: Expr;
  body: BlockStmt;
  pos: SourcePos;
}

export interface ReturnStmt {
  type: 'return';
  value: Expr | null;
  pos: SourcePos;
}

export interface JumpStmt {
  type: 'break' | 'continue';
  pos: SourcePos;
}

export interface ThrowStmt {
  type: 'throw';
  value: Expr;
  pos: SourcePos;
}

export interface TryStmt {
  type: 'try';
  body: BlockStmt;
  binding: string;
  handler: BlockStmt;
  pos: SourcePos;
}

export interface FnDecl {
  type: 'fn';
  name: string;
  params: string[];
  body: Stmt[];
  pos: SourcePos;
}

export type Stmt =
  | LetStmt
  | AssignStmt
  | ExprStmt
  | BlockStmt
  | IfStmt
  | WhileStmt
  | ForStmt
  | ReturnStmt
  | JumpStmt
  | ThrowStmt
  | TryStmt
  | FnDecl;

export interface Program {
  body: Stmt[];
}

export type NodeType = Expr['type'] | Stmt['type'];

export function countNodes(program: Program): Map<NodeType, number> {
  const counts = new Map<NodeType, number>();
  const bump = (type: NodeType): void => {
    counts.set(type, (counts.get(type) ?? 0) + 1);
  };
  const visitExpr = (expr: Expr): void => {
    bump(expr.type);
    switch (expr.type) {
      case 'list':
        expr.items.forEach(visitExpr);
        break;
      case 'record':
        for (const [, value] of expr.entries) visitExpr(value);
        break;
      case 'unary':
        visitExpr(expr.operand);
        break;
      case 'binary':
        visitExpr(expr.left);
        visitExpr(expr.right);
        break;
      case 'call':
        visitExpr(expr.callee);
        expr.args.forEach(visitExpr);
        break;
      case 'index':
        visitExpr(expr.target);
        visitExpr(expr.index);
        break;
      case 'member':
        visitExpr(expr.target);
        break;
      case 'lambda':
        expr.body.forEach(visitStmt);
        break;
      case 'if':
        visitExpr(expr.cond);
        visitExpr(expr.then);
        visitExpr(expr.otherwise);
        break;
      default:
        break;
    }
  };
  const visitStmt = (stmt: Stmt): void => {
    bump(stmt.type);
    switch (stmt.type) {
      case 'let':
        visitExpr(stmt.init);
        break;
      case 'assign':
        visitExpr(stmt.target);
        visitExpr(stmt.value);
        break;
      case 'expr':
        visitExpr(stmt.expr);
        break;
      case 'block':
        stmt.body.forEach(visitStmt);
        break;
      case 'ifStmt':
        visitExpr(stmt.cond);
        visitStmt(stmt.then);
        if (stmt.otherwise) visitStmt(stmt.otherwise);
        break;
      case 'while':
        visitExpr(stmt.cond);
        visitStmt(stmt.body);
        break;
      case 'for':
        visitExpr(stmt.iterable);
        visitStmt(stmt.body);
        break;
      case 'return':
        if (stmt.value !== null) visitExpr(stmt.value);
        break;
      case 'throw':
        visitExpr(stmt.value);
        break;
      case 'try':
        visitStmt(stmt.body);
        visitStmt(stmt.handler);
        break;
      case 'fn':
        stmt.body.forEach(visitStmt);
        break;
      default:
        break;
    }
  };
  program.body.forEach(visitStmt);
  return counts;
}
