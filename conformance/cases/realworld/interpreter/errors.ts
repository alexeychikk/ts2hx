export interface SourcePos {
  line: number;
  col: number;
}

export function formatPos(pos: SourcePos): string {
  return `${pos.line}:${pos.col}`;
}

export class LangError extends Error {
  constructor(
    message: string,
    readonly pos: SourcePos,
    readonly phase: string,
  ) {
    super(`${phase} error at ${formatPos(pos)}: ${message}`);
    this.name = 'LangError';
  }
}

export class LexError extends LangError {
  constructor(message: string, pos: SourcePos) {
    super(message, pos, 'lex');
    this.name = 'LexError';
  }
}

export class ParseError extends LangError {
  constructor(message: string, pos: SourcePos) {
    super(message, pos, 'parse');
    this.name = 'ParseError';
  }
}

export class RuntimeError extends LangError {
  readonly trace: string[] = [];

  constructor(message: string, pos: SourcePos) {
    super(message, pos, 'runtime');
    this.name = 'RuntimeError';
  }

  addFrame(frame: string): this {
    if (this.trace.length < 5) {
      this.trace.push(frame);
    }
    return this;
  }
}
