export function padRight(text: string, width: number): string {
  return text.length >= width ? text : text + ' '.repeat(width - text.length);
}

export function indent(text: string, depth: number): string {
  const prefix = '  '.repeat(depth);
  return text
    .split('\n')
    .map((line) => (line.length > 0 ? prefix + line : line))
    .join('\n');
}

export function quote(text: string): string {
  let out = '"';
  for (const ch of text) {
    switch (ch) {
      case '"':
        out += '\\"';
        break;
      case '\\':
        out += '\\\\';
        break;
      case '\n':
        out += '\\n';
        break;
      case '\t':
        out += '\\t';
        break;
      default:
        out += ch;
    }
  }
  return out + '"';
}

export function isDigit(ch: string): boolean {
  return ch >= '0' && ch <= '9';
}

export function isIdentStart(ch: string): boolean {
  return (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || ch === '_';
}

export function isIdentPart(ch: string): boolean {
  return isIdentStart(ch) || isDigit(ch);
}
