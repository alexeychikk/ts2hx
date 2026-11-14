import ts from 'typescript';

import {
  constExpr,
  FLOAT,
  HX_MATH,
  isStringType,
  RUNTIME,
  staticCall,
  STRING,
  unsupportedExpr,
} from '../ir/builders';
import type { HxBinop, HxExpr, HxModule, HxStmt, SourcePos } from '../ir/types';
import type { ModuleInfo, ProjectModel } from '../model/project-model';
import { CALL_BINDINGS, stdlibKey, VALUE_BINDINGS } from '../stdlib/bindings';

export interface UnsupportedReport {
  message: string;
  pos?: SourcePos;
}

const ARITHMETIC_OPERATORS: ReadonlyMap<ts.SyntaxKind, HxBinop> = new Map([
  [ts.SyntaxKind.MinusToken, '-'],
  [ts.SyntaxKind.AsteriskToken, '*'],
  [ts.SyntaxKind.SlashToken, '/'],
  [ts.SyntaxKind.PercentToken, '%'],
]);

const MAX_SOURCE_SNIPPET = 80;

const SYNTAX_KIND_NAMES: ReadonlyMap<ts.SyntaxKind, string> = (() => {
  const names = new Map<ts.SyntaxKind, string>();
  for (const [name, value] of Object.entries(ts.SyntaxKind)) {
    if (typeof value === 'number' && !/^(First|Last)/.test(name)) {
      names.set(value, name);
    }
  }
  return names;
})();

/** `SyntaxKind` name without the `FirstX`/`LastX` range aliases. */
export function syntaxKindName(kind: ts.SyntaxKind): string {
  return SYNTAX_KIND_NAMES.get(kind) ?? String(kind);
}

/** First line of a node's source, shortened: context for TODO comments, never emitted as code. */
function sourceSnippet(node: ts.Node): string {
  const firstLine = node.getText().split(/\r?\n/)[0].trim();
  return firstLine.length > MAX_SOURCE_SNIPPET
    ? `${firstLine.slice(0, MAX_SOURCE_SNIPPET)}…`
    : firstLine;
}

/** Converts one TS source file into a Haxe IR module (ADR 0001, Frontend). */
export class ModuleFrontend {
  private readonly checker: ts.TypeChecker;
  private readonly sourceFile: ts.SourceFile;

  constructor(
    private readonly model: ProjectModel,
    private readonly info: ModuleInfo,
    private readonly report: (unsupported: UnsupportedReport) => void,
  ) {
    this.checker = model.checker;
    this.sourceFile = info.sourceFile;
  }

  convert(): HxModule {
    return {
      pack: this.info.path.pack,
      name: this.info.path.module,
      sourceFile: this.sourceFile.fileName,
      imports: [],
      decls: [],
      init: this.sourceFile.statements.flatMap((s) => this.statement(s)),
    };
  }

  private pos(node: ts.Node): SourcePos {
    const { line, character } = this.sourceFile.getLineAndCharacterOfPosition(
      node.getStart(this.sourceFile),
    );
    return {
      file: this.sourceFile.fileName,
      line: line + 1,
      column: character + 1,
    };
  }

  private unsupported(node: ts.Node, message?: string): HxExpr {
    const text = message ?? `${syntaxKindName(node.kind)} is not supported yet`;
    const pos = this.pos(node);
    this.report({ message: text, pos });
    return unsupportedExpr(text, sourceSnippet(node), pos);
  }

  private statement(node: ts.Statement): HxStmt[] {
    if (ts.isExpressionStatement(node)) {
      return [{ kind: 'expr', expr: this.expression(node.expression) }];
    }
    if (
      ts.isEmptyStatement(node) ||
      ts.isImportDeclaration(node) ||
      ts.isExportDeclaration(node) ||
      ts.isInterfaceDeclaration(node) ||
      ts.isTypeAliasDeclaration(node)
    ) {
      return [];
    }
    return [{ kind: 'expr', expr: this.unsupported(node) }];
  }

  private typeOf(node: ts.Expression): ts.Type {
    return this.checker.getTypeAtLocation(node);
  }

  private isStringLike(node: ts.Expression): boolean {
    return (this.typeOf(node).flags & ts.TypeFlags.StringLike) !== 0;
  }

  private isNumberLike(node: ts.Expression): boolean {
    return (this.typeOf(node).flags & ts.TypeFlags.NumberLike) !== 0;
  }

  /** JS `String(value)` for a value of the given TS type. */
  private toJsString = (expr: HxExpr, type: ts.Type): HxExpr => {
    if (type.flags & ts.TypeFlags.StringLike || isStringType(expr.type)) {
      return expr;
    }
    if (type.flags & ts.TypeFlags.NumberLike) {
      return staticCall(RUNTIME.num, 'toString', [expr], STRING, expr.pos);
    }
    return staticCall(RUNTIME.ts2hx, 'string', [expr], STRING, expr.pos);
  };

  private stringOf(node: ts.Expression): HxExpr {
    return this.toJsString(this.expression(node), this.typeOf(node));
  }

  private concat(parts: HxExpr[], pos: SourcePos): HxExpr {
    const nonEmpty = parts.filter(
      (p) => !(p.kind === 'const' && p.value === ''),
    );
    if (nonEmpty.length === 0) {
      return constExpr('', pos);
    }
    if (!isStringType(nonEmpty[0].type)) {
      nonEmpty.unshift(constExpr('', pos));
    }
    return nonEmpty.reduce((left, right) => ({
      kind: 'binop',
      op: '+',
      left,
      right,
      type: STRING,
      pos,
    }));
  }

  expression(node: ts.Expression): HxExpr {
    const pos = this.pos(node);
    if (ts.isParenthesizedExpression(node)) {
      return this.expression(node.expression);
    }
    if (ts.isNumericLiteral(node)) {
      return constExpr(Number(node.text), pos);
    }
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      return constExpr(node.text, pos);
    }
    switch (node.kind) {
      case ts.SyntaxKind.TrueKeyword:
        return constExpr(true, pos);
      case ts.SyntaxKind.FalseKeyword:
        return constExpr(false, pos);
      case ts.SyntaxKind.NullKeyword:
        return constExpr(null, pos);
    }
    if (ts.isNonNullExpression(node) || ts.isSatisfiesExpression(node)) {
      return this.expression(node.expression);
    }
    if (ts.isTemplateExpression(node)) {
      return this.template(node, pos);
    }
    if (ts.isIdentifier(node)) {
      return this.identifier(node, pos);
    }
    if (ts.isPropertyAccessExpression(node)) {
      return this.valueBinding(node.name, pos) ?? this.unsupported(node);
    }
    if (ts.isPrefixUnaryExpression(node)) {
      return this.prefixUnary(node, pos);
    }
    if (ts.isBinaryExpression(node)) {
      return this.binary(node, pos);
    }
    if (ts.isCallExpression(node)) {
      return this.call(node, pos);
    }
    return this.unsupported(node);
  }

  private template(node: ts.TemplateExpression, pos: SourcePos): HxExpr {
    const parts: HxExpr[] = [constExpr(node.head.text, pos)];
    for (const span of node.templateSpans) {
      parts.push(this.stringOf(span.expression));
      parts.push(constExpr(span.literal.text, pos));
    }
    return this.concat(parts, pos);
  }

  private valueBinding(node: ts.Node, pos: SourcePos): HxExpr | undefined {
    const key = stdlibKey(
      this.model.program,
      this.checker,
      this.checker.getSymbolAtLocation(node),
    );
    const binding = key === undefined ? undefined : VALUE_BINDINGS.get(key);
    return binding?.(pos);
  }

  private identifier(node: ts.Identifier, pos: SourcePos): HxExpr {
    const symbol = this.checker.getSymbolAtLocation(node);
    if (node.text === 'undefined' && !symbol?.declarations?.length) {
      return constExpr(null, pos);
    }
    return this.valueBinding(node, pos) ?? this.unsupported(node);
  }

  private prefixUnary(node: ts.PrefixUnaryExpression, pos: SourcePos): HxExpr {
    if (!this.isNumberLike(node.operand)) {
      return this.unsupported(node);
    }
    switch (node.operator) {
      case ts.SyntaxKind.MinusToken:
        return {
          kind: 'unop',
          op: '-',
          postfix: false,
          operand: this.expression(node.operand),
          type: FLOAT,
          pos,
        };
      case ts.SyntaxKind.PlusToken:
        return this.expression(node.operand);
      default:
        return this.unsupported(node);
    }
  }

  private binary(node: ts.BinaryExpression, pos: SourcePos): HxExpr {
    const kind = node.operatorToken.kind;
    const numeric =
      this.isNumberLike(node.left) && this.isNumberLike(node.right);
    if (kind === ts.SyntaxKind.PlusToken) {
      if (this.isStringLike(node.left) || this.isStringLike(node.right)) {
        return this.concat(
          [this.stringOf(node.left), this.stringOf(node.right)],
          pos,
        );
      }
      if (numeric) {
        return this.arithmetic('+', node, pos);
      }
    }
    const op = ARITHMETIC_OPERATORS.get(kind);
    if (op && numeric) {
      return this.arithmetic(op, node, pos);
    }
    if (kind === ts.SyntaxKind.AsteriskAsteriskToken && numeric) {
      return staticCall(
        HX_MATH,
        'pow',
        [this.expression(node.left), this.expression(node.right)],
        FLOAT,
        pos,
      );
    }
    return this.unsupported(node);
  }

  private arithmetic(
    op: HxBinop,
    node: ts.BinaryExpression,
    pos: SourcePos,
  ): HxExpr {
    return {
      kind: 'binop',
      op,
      left: this.expression(node.left),
      right: this.expression(node.right),
      type: FLOAT,
      pos,
    };
  }

  private call(node: ts.CallExpression, pos: SourcePos): HxExpr {
    const callee = node.expression;
    const nameNode = ts.isPropertyAccessExpression(callee)
      ? callee.name
      : ts.isIdentifier(callee)
        ? callee
        : undefined;
    const key =
      nameNode &&
      stdlibKey(
        this.model.program,
        this.checker,
        this.checker.getSymbolAtLocation(nameNode),
      );
    const binding = key === undefined ? undefined : CALL_BINDINGS.get(key);
    if (!binding || node.arguments.some(ts.isSpreadElement)) {
      return this.unsupported(node);
    }
    const bound = binding({
      args: node.arguments.map((a) => this.expression(a)),
      argTypes: node.arguments.map((a) => this.typeOf(a)),
      pos,
      toJsString: this.toJsString,
    });
    return bound ?? this.unsupported(node);
  }
}
