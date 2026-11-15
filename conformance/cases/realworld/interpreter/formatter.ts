import { BlockStmt, Expr, Stmt } from './ast';
import { quote } from './util/strings';

const BINARY_PRECEDENCE: Record<string, number> = {
  or: 1,
  and: 2,
  '==': 3,
  '!=': 3,
  '<': 4,
  '<=': 4,
  '>': 4,
  '>=': 4,
  '..': 5,
  '+': 6,
  '-': 6,
  '*': 7,
  '/': 7,
  '%': 7,
};

export class Formatter {
  private lines: string[] = [];
  private level = 0;

  format(body: Stmt[]): string {
    this.lines = [];
    this.level = 0;
    body.forEach((stmt) => this.stmt(stmt));
    return this.lines.join('\n');
  }

  private emit(text: string): void {
    this.lines.push('  '.repeat(this.level) + text);
  }

  private block(header: string, block: BlockStmt | Stmt[], footer = '}'): void {
    this.emit(`${header} {`);
    this.level++;
    (Array.isArray(block) ? block : block.body).forEach((stmt) =>
      this.stmt(stmt),
    );
    this.level--;
    this.emit(footer);
  }

  private stmt(stmt: Stmt): void {
    switch (stmt.type) {
      case 'let':
        this.emit(`let ${stmt.name} = ${this.expr(stmt.init)};`);
        break;
      case 'assign':
        this.emit(
          `${this.expr(stmt.target)} ${stmt.op} ${this.expr(stmt.value)};`,
        );
        break;
      case 'expr':
        this.emit(`${this.expr(stmt.expr)};`);
        break;
      case 'block':
        this.block('', stmt);
        break;
      case 'ifStmt': {
        let current: Stmt | undefined = stmt;
        let header = `if ${this.expr(stmt.cond)}`;
        while (current !== undefined && current.type === 'ifStmt') {
          const next: Stmt | undefined = current.otherwise;
          this.emit(`${header} {`);
          this.level++;
          current.then.body.forEach((s) => this.stmt(s));
          this.level--;
          if (next !== undefined && next.type === 'ifStmt') {
            header = `} else if ${this.expr(next.cond)}`;
          } else if (next !== undefined) {
            this.block('} else', next);
            return;
          }
          current = next;
        }
        this.emit('}');
        break;
      }
      case 'while':
        this.block(`while ${this.expr(stmt.cond)}`, stmt.body);
        break;
      case 'for':
        this.block(
          `for ${stmt.name} in ${this.expr(stmt.iterable)}`,
          stmt.body,
        );
        break;
      case 'return':
        this.emit(
          stmt.value === null ? 'return;' : `return ${this.expr(stmt.value)};`,
        );
        break;
      case 'break':
      case 'continue':
        this.emit(`${stmt.type};`);
        break;
      case 'throw':
        this.emit(`throw ${this.expr(stmt.value)};`);
        break;
      case 'try':
        this.block('try', stmt.body);
        this.lines.pop();
        this.block(`} catch (${stmt.binding})`, stmt.handler);
        break;
      case 'fn':
        this.block(`fn ${stmt.name}(${stmt.params.join(', ')})`, stmt.body);
        break;
    }
  }

  expr(expr: Expr, parent = 0): string {
    switch (expr.type) {
      case 'number':
        return String(expr.value);
      case 'string':
        return quote(expr.value);
      case 'bool':
        return expr.value ? 'true' : 'false';
      case 'nil':
        return 'nil';
      case 'ident':
        return expr.name;
      case 'list':
        return `[${expr.items.map((item) => this.expr(item)).join(', ')}]`;
      case 'record':
        return `{${expr.entries.map(([key, value]) => `${key}: ${this.expr(value)}`).join(', ')}}`;
      case 'unary':
        return expr.op === 'not'
          ? `not ${this.expr(expr.operand, 8)}`
          : `-${this.expr(expr.operand, 8)}`;
      case 'binary': {
        const precedence = BINARY_PRECEDENCE[expr.op];
        const text = `${this.expr(expr.left, precedence - 1)} ${expr.op} ${this.expr(expr.right, precedence)}`;
        return precedence <= parent ? `(${text})` : text;
      }
      case 'call':
        return `${this.expr(expr.callee, 9)}(${expr.args.map((arg) => this.expr(arg)).join(', ')})`;
      case 'index':
        return `${this.expr(expr.target, 9)}[${this.expr(expr.index)}]`;
      case 'member':
        return `${this.expr(expr.target, 9)}.${expr.name}`;
      case 'lambda': {
        const only = expr.body.length === 1 ? expr.body[0] : undefined;
        if (
          only !== undefined &&
          only.type === 'return' &&
          only.value !== null
        ) {
          return `fn(${expr.params.join(', ')}) => ${this.expr(only.value)}`;
        }
        return `fn(${expr.params.join(', ')}) { ... ${expr.body.length} statements }`;
      }
      case 'if':
        return `if ${this.expr(expr.cond)} { ${this.expr(expr.then)} } else { ${this.expr(expr.otherwise)} }`;
    }
  }
}
