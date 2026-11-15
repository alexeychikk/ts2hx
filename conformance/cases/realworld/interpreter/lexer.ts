import { LexError, SourcePos } from './errors';
import { isDigit, isIdentPart, isIdentStart } from './util/strings';

export enum TokenKind {
  Number = 'number',
  String = 'string',
  Ident = 'ident',
  Keyword = 'keyword',
  Op = 'op',
  Punct = 'punct',
  Eof = 'eof',
}

export interface Token {
  kind: TokenKind;
  text: string;
  pos: SourcePos;
  value?: number;
}

export const KEYWORDS: ReadonlySet<string> = new Set([
  'let',
  'fn',
  'if',
  'else',
  'while',
  'for',
  'in',
  'return',
  'true',
  'false',
  'nil',
  'try',
  'catch',
  'throw',
  'break',
  'continue',
  'and',
  'or',
  'not',
]);

const TWO_CHAR_OPS = ['==', '!=', '<=', '>=', '..', '=>', '+=', '-='];
const ONE_CHAR_OPS = '+-*/%<>=!';
const PUNCT = '(){}[],;:.';

const ESCAPES: Record<string, string> = {
  n: '\n',
  t: '\t',
  '"': '"',
  '\\': '\\',
};

export class Lexer {
  private index = 0;
  private line = 1;
  private col = 1;
  private readonly tokens: Token[] = [];

  constructor(private readonly source: string) {}

  tokenize(): Token[] {
    while (true) {
      this.skipTrivia();
      if (this.atEnd()) {
        this.tokens.push({
          kind: TokenKind.Eof,
          text: '<eof>',
          pos: this.pos(),
        });
        return this.tokens;
      }
      this.tokens.push(this.next());
    }
  }

  private pos(): SourcePos {
    return { line: this.line, col: this.col };
  }

  private atEnd(): boolean {
    return this.index >= this.source.length;
  }

  private peek(offset = 0): string {
    return this.source.charAt(this.index + offset);
  }

  private advance(): string {
    const ch = this.source[this.index++];
    if (ch === '\n') {
      this.line++;
      this.col = 1;
    } else {
      this.col++;
    }
    return ch;
  }

  private skipTrivia(): void {
    while (!this.atEnd()) {
      const ch = this.peek();
      if (ch === ' ' || ch === '\t' || ch === '\r' || ch === '\n') {
        this.advance();
      } else if (ch === '#') {
        while (!this.atEnd() && this.peek() !== '\n') this.advance();
      } else {
        break;
      }
    }
  }

  private next(): Token {
    const start = this.pos();
    const ch = this.peek();
    if (isDigit(ch)) return this.number(start);
    if (ch === '"') return this.string(start);
    if (isIdentStart(ch)) return this.word(start);
    const two = ch + this.peek(1);
    if (TWO_CHAR_OPS.includes(two)) {
      this.advance();
      this.advance();
      return { kind: TokenKind.Op, text: two, pos: start };
    }
    if (ONE_CHAR_OPS.indexOf(ch) >= 0) {
      this.advance();
      return { kind: TokenKind.Op, text: ch, pos: start };
    }
    if (PUNCT.includes(ch)) {
      this.advance();
      return { kind: TokenKind.Punct, text: ch, pos: start };
    }
    throw new LexError(`unexpected character '${ch}'`, start);
  }

  private number(start: SourcePos): Token {
    let text = '';
    while (isDigit(this.peek())) text += this.advance();
    if (this.peek() === '.' && isDigit(this.peek(1))) {
      text += this.advance();
      while (isDigit(this.peek())) text += this.advance();
    }
    return {
      kind: TokenKind.Number,
      text,
      pos: start,
      value: parseFloat(text),
    };
  }

  private string(start: SourcePos): Token {
    this.advance();
    let text = '';
    while (this.peek() !== '"') {
      if (this.atEnd()) throw new LexError('unterminated string', start);
      let ch = this.advance();
      if (ch === '\\') {
        const escaped = this.advance();
        const mapped = ESCAPES[escaped];
        if (mapped === undefined) {
          throw new LexError(`bad escape \\${escaped}`, this.pos());
        }
        ch = mapped;
      }
      text += ch;
    }
    this.advance();
    return { kind: TokenKind.String, text, pos: start };
  }

  private word(start: SourcePos): Token {
    let text = '';
    while (isIdentPart(this.peek())) text += this.advance();
    const kind = KEYWORDS.has(text) ? TokenKind.Keyword : TokenKind.Ident;
    return { kind, text, pos: start };
  }
}

export function tokenize(source: string): Token[] {
  return new Lexer(source).tokenize();
}

export function describeToken(token: Token): string {
  return token.kind === TokenKind.Eof
    ? 'end of input'
    : `${token.kind} '${token.text}'`;
}
