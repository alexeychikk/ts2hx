import type {
  HxBinop,
  HxClassField,
  HxDecl,
  HxExpr,
  HxFunction,
  HxModule,
  HxParam,
  HxStmt,
  HxType,
  HxTypeParam,
  HxTypePath,
} from '../ir/types';
import { RUNTIME } from '../ir/builders';

const INDENT = '\t';

/** Name of the generated per-module initialiser called by `Main` (ADR 0005). */
export const MODULE_INIT = '__init';

export class PrinterError extends Error {}

/** Haxe binary operator precedence: lower binds tighter. */
const BINOP_PRECEDENCE: Record<HxBinop, number> = {
  '%': 2,
  '*': 3,
  '/': 3,
  '+': 4,
  '-': 4,
  '<<': 5,
  '>>': 5,
  '>>>': 5,
  '|': 6,
  '&': 6,
  '^': 6,
  '==': 7,
  '!=': 7,
  '<': 7,
  '<=': 7,
  '>': 7,
  '>=': 7,
  '&&': 9,
  '||': 10,
  '??': 11,
};
const NON_ASSOCIATIVE_LEVELS = new Set([6, 7, 11]);
const PRECEDENCE_UNARY = 1;
const PRECEDENCE_TERNARY = 12;
const PRECEDENCE_ASSIGN = 13;
const PRECEDENCE_LOWEST = 14;

export function printTypePath(path: HxTypePath): string {
  const parts = [...path.pack, path.module];
  if (path.name !== path.module) {
    parts.push(path.name);
  }
  return parts.join('.');
}

export function printType(type: HxType): string {
  switch (type.kind) {
    case 'path':
      return printTypePath(type.path) + printTypeArgs(type.params);
    case 'typeParam':
      return type.name;
    case 'fn': {
      const args = type.args.map((arg) => {
        const argType = arg.rest
          ? `haxe.Rest<${printType(arg.type)}>`
          : printType(arg.type);
        const prefix = arg.optional ? '?' : '';
        return arg.name
          ? `${prefix}${arg.name}:${argType}`
          : `${prefix}${argType}`;
      });
      const ret = printType(type.ret);
      return `(${args.join(', ')}) -> ${type.ret.kind === 'fn' ? `(${ret})` : ret}`;
    }
    case 'anon':
      if (type.fields.length === 0) {
        return '{}';
      }
      return `{ ${type.fields
        .map((field) => {
          if (field.method && field.type.kind === 'fn') {
            const params = field.type.args
              .map(
                (arg, i) =>
                  `${arg.optional ? '?' : ''}${arg.rest ? '...' : ''}${arg.name ?? `a${i}`}:${printType(arg.type)}`,
              )
              .join(', ');
            return `function ${field.name}(${params}):${printType(field.type.ret)};`;
          }
          const meta = field.optional ? '@:optional ' : '';
          const keyword = field.readonly ? 'final' : 'var';
          return `${meta}${keyword} ${field.name}:${printType(field.type)};`;
        })
        .join(' ')} }`;
    case 'null':
      return `Null<${printType(type.inner)}>`;
    case 'dynamic':
      return 'Dynamic';
  }
}

function printTypeArgs(params: HxType[]): string {
  return params.length > 0 ? `<${params.map(printType).join(', ')}>` : '';
}

function printTypeParams(params: HxTypeParam[]): string {
  if (params.length === 0) {
    return '';
  }
  return `<${params
    .map((p) =>
      p.constraints.length > 0
        ? `${p.name}:${p.constraints.map(printType).join(' & ')}`
        : p.name,
    )
    .join(', ')}>`;
}

/** Haxe double-quoted string literal (no interpolation). */
export function printString(value: string): string {
  let out = '"';
  for (const ch of value) {
    const code = ch.codePointAt(0)!;
    if (ch === '"') out += '\\"';
    else if (ch === '\\') out += '\\\\';
    else if (ch === '\n') out += '\\n';
    else if (ch === '\r') out += '\\r';
    else if (ch === '\t') out += '\\t';
    else if (code < 0x20 || code === 0x7f)
      out += `\\x${code.toString(16).padStart(2, '0')}`;
    else if (code >= 0xd800 && code <= 0xdfff)
      throw new PrinterError(
        'a lone UTF-16 surrogate cannot be written in Haxe source',
      );
    else out += ch;
  }
  return `${out}"`;
}

/** Haxe Float literal for a JS number; non-finite values go through `Math`. */
export function printFloat(value: number): string {
  if (Number.isNaN(value)) return 'Math.NaN';
  if (value === Infinity) return 'Math.POSITIVE_INFINITY';
  if (value === -Infinity) return 'Math.NEGATIVE_INFINITY';
  if (Object.is(value, -0)) return '-0.0';
  const text = String(value);
  const [mantissa, exponent] = text.split('e');
  const withDot = mantissa.includes('.') ? mantissa : `${mantissa}.0`;
  return exponent === undefined ? withDot : `${withDot}e${exponent}`;
}

function printConst(expr: Extract<HxExpr, { kind: 'const' }>): string {
  const { value } = expr;
  if (value === null) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'string') return printString(value);
  if (expr.int && Number.isInteger(value) && Math.abs(value) <= 0x7fffffff) {
    return String(value);
  }
  return printFloat(value);
}

function commentText(text: string): string {
  return text.replace(/\*\//g, '* /').replace(/[\r\n]+/g, ' ');
}

function unsupportedComment(
  expr: Extract<HxExpr, { kind: 'unsupported' }>,
): string {
  const source = expr.source ? `: ${expr.source}` : '';
  return `TODO(ts2hx): ${expr.message}${source}`;
}

function unsupportedCall(
  expr: Extract<HxExpr, { kind: 'unsupported' }>,
): string {
  return `${printTypePath(RUNTIME.ts2hx)}.unsupported(${printString(expr.message)})`;
}

function precedenceOf(expr: HxExpr): number {
  switch (expr.kind) {
    case 'binop':
      return BINOP_PRECEDENCE[expr.op];
    case 'unop':
      return PRECEDENCE_UNARY;
    case 'ternary':
      return PRECEDENCE_TERNARY;
    case 'assign':
      return PRECEDENCE_ASSIGN;
    case 'const':
      return typeof expr.value === 'number' &&
        (expr.value < 0 ||
          Object.is(expr.value, -0) ||
          expr.value === -Infinity)
        ? PRECEDENCE_UNARY
        : 0;
    case 'cast':
    case 'unsupported':
    case 'fn':
      return PRECEDENCE_LOWEST;
    default:
      return 0;
  }
}

class Printer {
  private depth = 0;

  private indent(): string {
    return INDENT.repeat(this.depth);
  }

  expr(expr: HxExpr): string {
    switch (expr.kind) {
      case 'const':
        return printConst(expr);
      case 'local':
        return expr.name;
      case 'this':
        return 'this';
      case 'super':
        return 'super';
      case 'typeRef':
        return printTypePath(expr.path);
      case 'field':
        return `${this.operand(expr.target)}${expr.safe ? '?.' : '.'}${expr.name}`;
      case 'staticField':
        return `${printTypePath(expr.owner)}.${expr.name}`;
      case 'moduleField': {
        const { pack, module } = expr.module;
        return `${[...pack, module].join('.')}.${expr.name}`;
      }
      case 'index':
        return `${this.operand(expr.target)}[${this.expr(expr.index)}]`;
      case 'call': {
        const args = expr.args.map((arg, i) =>
          expr.spreadLast && i === expr.args.length - 1
            ? `...${this.sub(arg, PRECEDENCE_UNARY)}`
            : this.expr(arg),
        );
        return `${this.operand(expr.callee)}(${args.join(', ')})`;
      }
      case 'new':
        return `new ${printTypePath(expr.path)}${printTypeArgs(expr.typeArgs)}(${expr.args
          .map((a) => this.expr(a))
          .join(', ')})`;
      case 'binop': {
        const level = BINOP_PRECEDENCE[expr.op];
        const nonAssoc = NON_ASSOCIATIVE_LEVELS.has(level);
        const left = this.sub(expr.left, nonAssoc ? level - 1 : level);
        const right = this.sub(expr.right, level - 1);
        return `${left} ${expr.op} ${right}`;
      }
      case 'unop': {
        const operand = this.sub(expr.operand, 0);
        return expr.postfix ? `${operand}${expr.op}` : `${expr.op}${operand}`;
      }
      case 'assign':
        return `${this.sub(expr.target, 0)} ${expr.op} ${this.sub(
          expr.value,
          PRECEDENCE_ASSIGN,
        )}`;
      case 'ternary':
        return `${this.sub(expr.cond, PRECEDENCE_TERNARY - 1)} ? ${this.sub(
          expr.then,
          PRECEDENCE_TERNARY,
        )} : ${this.sub(expr.else, PRECEDENCE_TERNARY)}`;
      case 'arrayLit':
        return `[${expr.elements.map((e) => this.expr(e)).join(', ')}]`;
      case 'objectLit':
        return `{${expr.fields
          .map(
            (f) =>
              `${/^[A-Za-z_][A-Za-z0-9_]*$/.test(f.name) ? f.name : printString(f.name)}: ${this.expr(f.value)}`,
          )
          .join(', ')}}`;
      case 'fn':
        return `function${this.signature(expr.fn)} ${this.body(expr.fn)}`;
      case 'cast':
        return expr.checked
          ? `cast(${this.expr(expr.expr)}, ${printType(expr.type)})`
          : `(cast ${this.sub(expr.expr, PRECEDENCE_UNARY)} : ${printType(expr.type)})`;
      case 'isOfType':
        return `Std.isOfType(${this.expr(expr.expr)}, ${printTypePath(expr.path)})`;
      case 'blockExpr': {
        this.depth++;
        const lines = [
          ...expr.stmts.map((s) => this.stmt(s)),
          `${this.indent()}${this.expr(expr.result)};`,
        ];
        this.depth--;
        return `{\n${lines.join('\n')}\n${this.indent()}}`;
      }
      case 'unsupported':
        return `/* ${commentText(unsupportedComment(expr))} */ ${unsupportedCall(expr)}`;
      case 'yield':
      case 'await':
        throw new PrinterError(
          `'${expr.kind}' must be lowered by a pass before printing`,
        );
    }
  }

  /** Prints `expr`, parenthesised unless it binds at least as tight as `maxLevel`. */
  private sub(expr: HxExpr, maxLevel: number): string {
    const text = this.expr(expr);
    const blockOperand =
      expr.kind === 'blockExpr' && maxLevel < PRECEDENCE_TERNARY;
    return blockOperand || precedenceOf(expr) > maxLevel ? `(${text})` : text;
  }

  /** Target of a field access, call or index: must be a primary expression. */
  private operand(expr: HxExpr): string {
    return this.sub(expr, 0);
  }

  private params(params: HxParam[]): string {
    return params
      .map((p) => {
        const prefix = p.rest ? '...' : p.optional ? '?' : '';
        const init = p.defaultValue ? ` = ${this.expr(p.defaultValue)}` : '';
        return `${prefix}${p.name}:${printType(p.type)}${init}`;
      })
      .join(', ');
  }

  private signature(fn: HxFunction, constructor = false): string {
    const ret = constructor ? '' : `:${printType(fn.ret)}`;
    return `${printTypeParams(fn.typeParams)}(${this.params(fn.params)})${ret}`;
  }

  private body(fn: HxFunction): string {
    return this.block(fn.body ?? []);
  }

  block(stmts: HxStmt[]): string {
    if (stmts.length === 0) {
      return '{}';
    }
    this.depth++;
    const lines = stmts.map((s) => this.stmt(s));
    this.depth--;
    return `{\n${lines.join('\n')}\n${this.indent()}}`;
  }

  stmt(stmt: HxStmt): string {
    const ind = this.indent();
    switch (stmt.kind) {
      case 'expr':
        if (stmt.expr.kind === 'unsupported') {
          return `${ind}// ${commentText(unsupportedComment(stmt.expr))}\n${ind}${unsupportedCall(stmt.expr)};`;
        }
        return `${ind}${this.expr(stmt.expr)};`;
      case 'var': {
        const type = stmt.type ? `:${printType(stmt.type)}` : '';
        const init = stmt.init ? ` = ${this.expr(stmt.init)}` : '';
        return `${ind}${stmt.final ? 'final' : 'var'} ${stmt.name}${type}${init};`;
      }
      case 'localFunction':
        return `${ind}function ${stmt.name}${this.signature(stmt.fn)} ${this.body(stmt.fn)}`;
      case 'block':
        return `${ind}${this.block(stmt.body)}`;
      case 'if': {
        let out = `${ind}if (${this.expr(stmt.cond)}) ${this.block(stmt.then)}`;
        if (stmt.else) {
          const [only] = stmt.else;
          out +=
            stmt.else.length === 1 && only.kind === 'if'
              ? ` else ${this.stmt(only).trimStart()}`
              : ` else ${this.block(stmt.else)}`;
        }
        return out;
      }
      case 'while':
        return stmt.doWhile
          ? `${ind}do ${this.block(stmt.body)} while (${this.expr(stmt.cond)});`
          : `${ind}while (${this.expr(stmt.cond)}) ${this.block(stmt.body)}`;
      case 'forIn':
        return `${ind}for (${stmt.name} in ${this.expr(stmt.iterable)}) ${this.block(stmt.body)}`;
      case 'switch': {
        this.depth++;
        const caseInd = this.indent();
        const cases = stmt.cases.map(
          (c) =>
            `${caseInd}case ${c.values.map((v) => this.expr(v)).join(', ')}: ${this.block(c.body)}`,
        );
        if (stmt.default) {
          cases.push(`${caseInd}default: ${this.block(stmt.default)}`);
        }
        this.depth--;
        return `${ind}switch (${this.expr(stmt.subject)}) {\n${cases.join('\n')}\n${ind}}`;
      }
      case 'try':
        return `${ind}try ${this.block(stmt.body)}${stmt.catches
          .map(
            (c) =>
              ` catch (${c.name}:${printType(c.type)}) ${this.block(c.body)}`,
          )
          .join('')}`;
      case 'return':
        return stmt.value
          ? `${ind}return ${this.expr(stmt.value)};`
          : `${ind}return;`;
      case 'break':
        return `${ind}break;`;
      case 'continue':
        return `${ind}continue;`;
      case 'throw':
        return `${ind}throw ${this.expr(stmt.value)};`;
      case 'comment': {
        const prefix = stmt.todo ? 'TODO(ts2hx): ' : '';
        return stmt.text
          .split(/\r?\n/)
          .map((line, i) => `${ind}// ${i === 0 ? prefix : ''}${line}`)
          .join('\n');
      }
      case 'labeled':
      case 'labeledBreak':
      case 'labeledContinue':
      case 'cFor':
      case 'tsSwitch':
      case 'tryFinally':
        throw new PrinterError(
          `'${stmt.kind}' must be lowered by a pass before printing`,
        );
    }
  }

  private classField(field: HxClassField): string {
    const ind = this.indent();
    const modifiers: string[] = [field.access];
    if (field.isStatic) modifiers.push('static');
    switch (field.kind) {
      case 'var': {
        const init = field.init ? ` = ${this.expr(field.init)}` : '';
        return `${ind}${modifiers.join(' ')} ${field.final ? 'final' : 'var'} ${field.name}:${printType(field.type)}${init};`;
      }
      case 'property': {
        const meta = field.isVar ? `${ind}@:isVar\n` : '';
        return `${meta}${ind}${modifiers.join(' ')} var ${field.name}(${field.get}, ${field.set}):${printType(field.type)};`;
      }
      case 'method': {
        if (field.isOverride) modifiers.push('override');
        if (field.isAbstract) modifiers.push('abstract');
        const head = `${ind}${modifiers.join(' ')} function ${field.name}${this.signature(field.fn, field.name === 'new')}`;
        return field.isAbstract || !field.fn.body
          ? `${head};`
          : `${head} ${this.body(field.fn)}`;
      }
    }
  }

  decl(decl: HxDecl): string {
    switch (decl.kind) {
      case 'class': {
        const meta = decl.meta.map((m) => `${m}\n`).join('');
        const parent = decl.superClass
          ? ` extends ${printTypePath(decl.superClass.path)}${printTypeArgs(decl.superClass.params)}`
          : '';
        this.depth++;
        const fields = decl.fields.map((f) => this.classField(f));
        this.depth--;
        const body = fields.length > 0 ? `{\n${fields.join('\n\n')}\n}` : '{}';
        return `${meta}${decl.isAbstract ? 'abstract ' : ''}class ${decl.name}${printTypeParams(decl.typeParams)}${parent} ${body}`;
      }
      case 'typedef':
        return `typedef ${decl.name}${printTypeParams(decl.typeParams)} = ${printType(decl.type)};`;
      case 'enumAbstract': {
        this.depth++;
        const members = decl.members.map(
          (m) => `${this.indent()}var ${m.name} = ${this.expr(m.value)};`,
        );
        const fields = (decl.fields ?? []).map((f) => this.classField(f));
        this.depth--;
        const underlying = printType(decl.underlying);
        const todo = decl.todo
          ? `// TODO(ts2hx): ${commentText(decl.todo)}\n`
          : '';
        const body = [members.join('\n'), ...fields]
          .filter((part) => part !== '')
          .join('\n\n');
        return `${todo}enum abstract ${decl.name}(${underlying}) from ${underlying} to ${underlying} {\n${body}\n}`;
      }
      case 'moduleVar': {
        const init = decl.init ? ` = ${this.expr(decl.init)}` : '';
        return `${decl.final ? 'final' : 'var'} ${decl.name}:${printType(decl.type)}${init};`;
      }
      case 'moduleFunction':
        return `function ${decl.name}${this.signature(decl.fn)} ${this.body(decl.fn)}`;
    }
  }
}

export function printExpr(expr: HxExpr): string {
  return new Printer().expr(expr);
}

export function printStmts(stmts: HxStmt[]): string {
  const printer = new Printer();
  return stmts.map((s) => printer.stmt(s)).join('\n');
}

export function printDecl(decl: HxDecl): string {
  return new Printer().decl(decl);
}

/** Prints a whole module, always ending with its `__init()` (possibly empty). */
export function printModule(module: HxModule): string {
  const printer = new Printer();
  const sections: string[] = [];
  if (module.pack.length > 0) {
    sections.push(`package ${module.pack.join('.')};`);
  }
  if (module.imports.length > 0) {
    sections.push(
      module.imports.map((p) => `import ${printTypePath(p)};`).join('\n'),
    );
  }
  sections.push(...module.decls.map((d) => printer.decl(d)));
  sections.push(`function ${MODULE_INIT}():Void ${printer.block(module.init)}`);
  return `${sections.join('\n\n')}\n`;
}
