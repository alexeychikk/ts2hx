import {
  AssignStmt,
  BinaryOp,
  BlockStmt,
  Expr,
  FnDecl,
  IfStmt,
  Program,
  Stmt,
  TryStmt,
} from './ast';
import { ParseError, SourcePos } from './errors';
import { describeToken, Token, TokenKind, tokenize } from './lexer';

const PRECEDENCE = new Map<string, number>([
  ['or', 1],
  ['and', 2],
  ['==', 3],
  ['!=', 3],
  ['<', 4],
  ['<=', 4],
  ['>', 4],
  ['>=', 4],
  ['..', 5],
  ['+', 6],
  ['-', 6],
  ['*', 7],
  ['/', 7],
  ['%', 7],
]);

export class Parser {
  private current = 0;
  private lambdaCount = 0;

  constructor(private readonly tokens: Token[]) {}

  static parse(source: string): Program {
    return new Parser(tokenize(source)).program();
  }

  program(): Program {
    const body: Stmt[] = [];
    while (!this.check(TokenKind.Eof)) {
      body.push(this.statement());
    }
    return { body };
  }

  private peek(): Token {
    return this.tokens[this.current];
  }

  private previous(): Token {
    return this.tokens[this.current - 1];
  }

  private check(kind: TokenKind, text?: string): boolean {
    const token = this.peek();
    return token.kind === kind && (text === undefined || token.text === text);
  }

  private match(kind: TokenKind, ...texts: string[]): boolean {
    const token = this.peek();
    if (token.kind !== kind) return false;
    if (texts.length > 0 && !texts.includes(token.text)) return false;
    this.current++;
    return true;
  }

  private expect(kind: TokenKind, text: string): Token {
    if (this.check(kind, text)) {
      return this.tokens[this.current++];
    }
    throw this.error(
      `expected '${text}' but found ${describeToken(this.peek())}`,
    );
  }

  private expectIdent(what: string): string {
    if (this.check(TokenKind.Ident)) {
      return this.tokens[this.current++].text;
    }
    throw this.error(
      `expected ${what} but found ${describeToken(this.peek())}`,
    );
  }

  private error(message: string, pos?: SourcePos): ParseError {
    return new ParseError(message, pos ?? this.peek().pos);
  }

  private statement(): Stmt {
    const token = this.peek();
    if (token.kind === TokenKind.Keyword) {
      switch (token.text) {
        case 'let':
          return this.letStatement();
        case 'fn':
          if (this.tokens[this.current + 1].kind === TokenKind.Ident) {
            return this.fnDeclaration();
          }
          break;
        case 'if':
          return this.ifStatement();
        case 'while': {
          this.current++;
          const cond = this.expression();
          return { type: 'while', cond, body: this.block(), pos: token.pos };
        }
        case 'for': {
          this.current++;
          const name = this.expectIdent('loop variable');
          this.expect(TokenKind.Keyword, 'in');
          const iterable = this.expression();
          return {
            type: 'for',
            name,
            iterable,
            body: this.block(),
            pos: token.pos,
          };
        }
        case 'return': {
          this.current++;
          const value = this.check(TokenKind.Punct, ';')
            ? null
            : this.expression();
          this.expect(TokenKind.Punct, ';');
          return { type: 'return', value, pos: token.pos };
        }
        case 'break':
        case 'continue':
          this.current++;
          this.expect(TokenKind.Punct, ';');
          return { type: token.text, pos: token.pos };
        case 'throw': {
          this.current++;
          const value = this.expression();
          this.expect(TokenKind.Punct, ';');
          return { type: 'throw', value, pos: token.pos };
        }
        case 'try':
          return this.tryStatement();
      }
    }
    if (this.check(TokenKind.Punct, '{')) {
      return this.block();
    }
    return this.expressionStatement();
  }

  private letStatement(): Stmt {
    const pos = this.peek().pos;
    this.current++;
    const name = this.expectIdent('variable name');
    this.expect(TokenKind.Op, '=');
    const init = this.expression();
    this.expect(TokenKind.Punct, ';');
    return { type: 'let', name, init, pos };
  }

  private fnDeclaration(): FnDecl {
    const pos = this.peek().pos;
    this.current++;
    const name = this.expectIdent('function name');
    const params = this.parameters();
    const body = this.block().body;
    return { type: 'fn', name, params, body, pos };
  }

  private parameters(): string[] {
    this.expect(TokenKind.Punct, '(');
    const params: string[] = [];
    if (!this.check(TokenKind.Punct, ')')) {
      do {
        const name = this.expectIdent('parameter name');
        if (params.includes(name)) {
          throw this.error(
            `duplicate parameter '${name}'`,
            this.previous().pos,
          );
        }
        params.push(name);
      } while (this.match(TokenKind.Punct, ','));
    }
    this.expect(TokenKind.Punct, ')');
    return params;
  }

  private ifStatement(): IfStmt {
    const pos = this.peek().pos;
    this.current++;
    const cond = this.expression();
    const then = this.block();
    let otherwise: BlockStmt | IfStmt | undefined;
    if (this.match(TokenKind.Keyword, 'else')) {
      otherwise = this.check(TokenKind.Keyword, 'if')
        ? this.ifStatement()
        : this.block();
    }
    return { type: 'ifStmt', cond, then, otherwise, pos };
  }

  private tryStatement(): TryStmt {
    const pos = this.peek().pos;
    this.current++;
    const body = this.block();
    this.expect(TokenKind.Keyword, 'catch');
    this.expect(TokenKind.Punct, '(');
    const binding = this.expectIdent('catch binding');
    this.expect(TokenKind.Punct, ')');
    const handler = this.block();
    return { type: 'try', body, binding, handler, pos };
  }

  private block(): BlockStmt {
    const open = this.expect(TokenKind.Punct, '{');
    const body: Stmt[] = [];
    while (!this.check(TokenKind.Punct, '}')) {
      if (this.check(TokenKind.Eof)) {
        throw this.error(
          `unclosed block opened at ${open.pos.line}:${open.pos.col}`,
        );
      }
      body.push(this.statement());
    }
    this.current++;
    return { type: 'block', body, pos: open.pos };
  }

  private expressionStatement(): Stmt {
    const pos = this.peek().pos;
    const expr = this.expression();
    if (this.match(TokenKind.Op, '=', '+=', '-=')) {
      const op = this.previous().text as AssignStmt['op'];
      if (
        expr.type !== 'ident' &&
        expr.type !== 'index' &&
        expr.type !== 'member'
      ) {
        throw this.error('invalid assignment target', expr.pos);
      }
      const value = this.expression();
      this.expect(TokenKind.Punct, ';');
      return { type: 'assign', target: expr, op, value, pos };
    }
    this.expect(TokenKind.Punct, ';');
    return { type: 'expr', expr, pos };
  }

  expression(minPrecedence = 0): Expr {
    let left = this.unary();
    while (true) {
      const token = this.peek();
      const isBinary =
        token.kind === TokenKind.Op ||
        (token.kind === TokenKind.Keyword &&
          (token.text === 'and' || token.text === 'or'));
      const precedence = isBinary ? PRECEDENCE.get(token.text) : undefined;
      if (precedence === undefined || precedence <= minPrecedence) break;
      this.current++;
      const right = this.expression(precedence);
      left = {
        type: 'binary',
        op: token.text as BinaryOp,
        left,
        right,
        pos: token.pos,
      };
    }
    return left;
  }

  private unary(): Expr {
    const token = this.peek();
    if (this.match(TokenKind.Op, '-')) {
      return { type: 'unary', op: '-', operand: this.unary(), pos: token.pos };
    }
    if (this.match(TokenKind.Keyword, 'not') || this.match(TokenKind.Op, '!')) {
      return {
        type: 'unary',
        op: 'not',
        operand: this.unary(),
        pos: token.pos,
      };
    }
    return this.postfix(this.primary());
  }

  private postfix(start: Expr): Expr {
    let expr = start;
    while (true) {
      const token = this.peek();
      if (this.match(TokenKind.Punct, '(')) {
        const args: Expr[] = [];
        if (!this.check(TokenKind.Punct, ')')) {
          do {
            args.push(this.expression());
          } while (this.match(TokenKind.Punct, ','));
        }
        this.expect(TokenKind.Punct, ')');
        expr = { type: 'call', callee: expr, args, pos: token.pos };
      } else if (this.match(TokenKind.Punct, '[')) {
        const index = this.expression();
        this.expect(TokenKind.Punct, ']');
        expr = { type: 'index', target: expr, index, pos: token.pos };
      } else if (this.match(TokenKind.Punct, '.')) {
        const name = this.expectIdent('property name');
        expr = { type: 'member', target: expr, name, pos: token.pos };
      } else {
        return expr;
      }
    }
  }

  private primary(): Expr {
    const token = this.peek();
    switch (token.kind) {
      case TokenKind.Number:
        this.current++;
        return { type: 'number', value: token.value ?? 0, pos: token.pos };
      case TokenKind.String:
        this.current++;
        return { type: 'string', value: token.text, pos: token.pos };
      case TokenKind.Ident:
        this.current++;
        return { type: 'ident', name: token.text, pos: token.pos };
      case TokenKind.Keyword:
        return this.keywordExpression(token);
      case TokenKind.Punct:
        return this.punctExpression(token);
      default:
        throw this.error(`unexpected ${describeToken(token)}`);
    }
  }

  private keywordExpression(token: Token): Expr {
    switch (token.text) {
      case 'true':
      case 'false':
        this.current++;
        return { type: 'bool', value: token.text === 'true', pos: token.pos };
      case 'nil':
        this.current++;
        return { type: 'nil', pos: token.pos };
      case 'fn': {
        this.current++;
        const params = this.parameters();
        this.lambdaCount++;
        if (this.match(TokenKind.Op, '=>')) {
          const value = this.expression();
          return {
            type: 'lambda',
            params,
            body: [{ type: 'return', value, pos: value.pos }],
            pos: token.pos,
          };
        }
        return {
          type: 'lambda',
          params,
          body: this.block().body,
          pos: token.pos,
        };
      }
      case 'if': {
        this.current++;
        const cond = this.expression();
        this.expect(TokenKind.Punct, '{');
        const then = this.expression();
        this.expect(TokenKind.Punct, '}');
        this.expect(TokenKind.Keyword, 'else');
        this.expect(TokenKind.Punct, '{');
        const otherwise = this.expression();
        this.expect(TokenKind.Punct, '}');
        return { type: 'if', cond, then, otherwise, pos: token.pos };
      }
      default:
        throw this.error(`unexpected ${describeToken(token)}`);
    }
  }

  private punctExpression(token: Token): Expr {
    if (this.match(TokenKind.Punct, '(')) {
      const inner = this.expression();
      this.expect(TokenKind.Punct, ')');
      return inner;
    }
    if (this.match(TokenKind.Punct, '[')) {
      const items: Expr[] = [];
      while (!this.check(TokenKind.Punct, ']')) {
        items.push(this.expression());
        if (!this.match(TokenKind.Punct, ',')) break;
      }
      this.expect(TokenKind.Punct, ']');
      return { type: 'list', items, pos: token.pos };
    }
    if (this.match(TokenKind.Punct, '{')) {
      const entries: Array<[string, Expr]> = [];
      while (!this.check(TokenKind.Punct, '}')) {
        const key = this.peek();
        if (key.kind !== TokenKind.Ident && key.kind !== TokenKind.String) {
          throw this.error(`bad record key ${describeToken(key)}`);
        }
        this.current++;
        this.expect(TokenKind.Punct, ':');
        entries.push([key.text, this.expression()]);
        if (!this.match(TokenKind.Punct, ',')) break;
      }
      this.expect(TokenKind.Punct, '}');
      return { type: 'record', entries, pos: token.pos };
    }
    throw this.error(`unexpected ${describeToken(token)}`);
  }

  get stats(): { tokens: number; lambdas: number } {
    return { tokens: this.tokens.length, lambdas: this.lambdaCount };
  }
}
