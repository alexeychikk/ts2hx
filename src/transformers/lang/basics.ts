import ts, { SyntaxKind } from 'typescript';
import { logger } from '../../Logger';
import {
  type VisitNodeContext,
  type Transpiler,
  type EmitFn,
} from '../Transpiler';

export const transformKeywords: EmitFn = function (this: Transpiler, node) {
  switch (node.kind) {
    // myVar: number
    case SyntaxKind.NumberKeyword:
      return 'Float';
    // myVar: string
    case SyntaxKind.StringKeyword:
      return 'String';
    // myVar: boolean
    case SyntaxKind.BooleanKeyword:
      return 'Bool';
    // myVar: undefined
    case SyntaxKind.UndefinedKeyword:
      return 'Null<Any>';
    case SyntaxKind.VoidKeyword:
    case SyntaxKind.NeverKeyword:
      return 'Void';
    // myVar: unknown
    case SyntaxKind.UnknownKeyword:
    // myVar: any
    case SyntaxKind.AnyKeyword:
    // myVar: object
    case SyntaxKind.ObjectKeyword:
    // myVar: symbol
    case SyntaxKind.SymbolKeyword:
      return 'Any';
    // type T = ...
    case SyntaxKind.TypeKeyword:
      return 'typedef';
    // (myVar as string)
    case SyntaxKind.AsKeyword:
      return ':';
    case SyntaxKind.AsyncKeyword:
      return '@:async';
    case SyntaxKind.AwaitKeyword:
      return '@:await';
    case SyntaxKind.ExportAssignment:
    case SyntaxKind.ExportDeclaration:
    case SyntaxKind.ExportKeyword:
    case SyntaxKind.ReadonlyKeyword:
      return ' ';
    case SyntaxKind.ProtectedKeyword:
      return 'private';
    case SyntaxKind.EqualsGreaterThanToken:
      return '->';
    case SyntaxKind.EqualsEqualsEqualsToken:
      return '==';
    case SyntaxKind.ExclamationEqualsEqualsToken:
      return '!=';
    case SyntaxKind.Identifier:
      switch (node.getText()) {
        // myVar = undefined
        case 'undefined':
          return 'null';
        // myVar = NaN
        case 'NaN':
          return 'Math.NaN';
        // myVar = Infinity
        case 'Infinity':
          return 'Math.POSITIVE_INFINITY';
      }
  }
};

export const transformJsDoc: EmitFn = function (this: Transpiler, node) {
  if (!ts.isJSDoc(node)) return;
  return '';
};

export const transformSimpleTemplate: EmitFn = function (
  this: Transpiler,
  node,
) {
  // `"Hello"`
  if (!ts.isNoSubstitutionTemplateLiteral(node)) return;
  return `"${this.utils.escapeStringText(node.text)}"`;
};

export const transformTemplateExpression: EmitFn = function (
  this: Transpiler,
  node,
  context,
) {
  // `foo ${varX} bar ${varY ? `inner ${varZ} end` : ""} baz`
  if (!ts.isTemplateExpression(node)) return;
  return `'${this.utils.escapeTemplateText(node.head.text)}${node.templateSpans
    .map((span) => `\${${this.emitNode(span, context)}`)
    .join('')}'`;
};

export const transformTemplateParts: EmitFn = function (
  this: Transpiler,
  node,
) {
  if (!ts.isTemplateMiddleOrTemplateTail(node)) return;
  return `}${this.utils.escapeTemplateText(node.text)}`;
};

export const transformRegex: EmitFn = function (this: Transpiler, node) {
  // /[a-z]{0,9}/gim
  if (!ts.isRegularExpressionLiteral(node)) return;
  return `~${node.text}`;
};

export const transformVoidExpression: EmitFn = function (
  this: Transpiler,
  node,
  context,
) {
  if (!ts.isVoidExpression(node)) return;
  if (
    ts.isLiteralExpression(node.expression) ||
    ts.isIdentifier(node.expression)
  ) {
    return `null`;
  } else {
    return `(function() {${this.emitNode(node.expression, context)};})()`;
  }
};

export const transformTypeofExpression: EmitFn = function (
  this: Transpiler,
  node,
  context,
) {
  if (!ts.isTypeOfExpression(node)) return;

  return `Ts2hx.typeof(${this.emitNode(node.expression, context)})`;
};

export const transformInstanceOfExpression: EmitFn = function (
  this: Transpiler,
  node,
  context,
) {
  // error instanceof Error
  if (
    !(
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === SyntaxKind.InstanceOfKeyword
    )
  )
    return;

  const left = this.emitNode(node.left, context).trim();
  const right = this.emitNode(node.right, context).trim();

  return `Std.isOfType(${left}, ${right})`;
};

/**
 * npm packages that have a Haxe shim in the ts2hx lib — their supported
 * symbols are redirected to the shim module instead of the npm sources
 */
const EXTERNAL_MODULE_SHIMS: Record<
  string,
  { haxeModule: string; symbols: Set<string>; defaultImport?: string }
> = {
  joi: {
    haxeModule: 'ts2hx.Joi',
    symbols: new Set(),
    defaultImport: 'Joi',
  },
  seedrandom: {
    haxeModule: 'ts2hx.SeedRandom',
    symbols: new Set(),
    defaultImport: 'seedRandom',
  },
  lodash: {
    haxeModule: 'ts2hx.Lodash',
    symbols: new Set([
      'clamp',
      'cloneDeep',
      'compact',
      'debounce',
      'difference',
      'dropRight',
      'escapeRegExp',
      'filter',
      'find',
      'first',
      'flatMap',
      'forEach',
      'groupBy',
      'head',
      'isEmpty',
      'isEqual',
      'keyBy',
      'last',
      'map',
      'mapValues',
      'maxBy',
      'memoize',
      'minBy',
      'noop',
      'omit',
      'omitBy',
      'orderBy',
      'pick',
      'pickBy',
      'pull',
      'remove',
      'some',
      'sortBy',
      'sum',
      'sumBy',
      'times',
      'transform',
      'uniq',
      'uniqBy',
      'without',
    ]),
  },
  nanoid: {
    haxeModule: 'ts2hx.Nanoid',
    symbols: new Set([
      'nanoid',
      'customAlphabet',
      'customRandom',
      'urlAlphabet',
    ]),
  },
};

const isExternalFileName = (fileName: string): boolean =>
  /[\\/]node_modules[\\/]/.test(fileName);

export const transformImportDeclaration: EmitFn = function (
  this: Transpiler,
  node,
  context,
) {
  if (!ts.isImportDeclaration(node)) return;

  const moduleName = ts.isStringLiteral(node.moduleSpecifier)
    ? node.moduleSpecifier.text
    : node.moduleSpecifier.getText().replace(/['"]/g, '');
  const shim = EXTERNAL_MODULE_SHIMS[moduleName];

  // import './foo';
  if (!node.importClause) {
    return this.utils.commentOutNode(
      node,
      `Side-effect only import is not supported`,
    );
  }

  // import foo from './foo';
  if (!node.importClause.namedBindings) {
    const symbol = this.typeChecker.getSymbolAtLocation(
      node.importClause.name!,
    );
    if (!symbol) return '';
    const aliasedSymbol = this.typeChecker.getAliasedSymbol(symbol);
    const fileName = aliasedSymbol?.declarations?.[0].getSourceFile().fileName;
    if (!fileName) return '';

    if (isExternalFileName(fileName)) {
      if (shim?.defaultImport) {
        return `import ${shim.haxeModule}.${shim.defaultImport}${
          symbol.name !== shim.defaultImport ? ` as ${symbol.name}` : ''
        };`;
      }
      return this.utils.commentOutNode(
        node,
        `Import from an external module is not supported`,
      );
    }

    return `import ${this.utils.getImportedPackageName(fileName)}.${
      aliasedSymbol.name
    }${symbol.name !== aliasedSymbol.name ? ` as ${symbol.name}` : ''};`;
  }

  // import { foo, bar as quz } from './foo';
  if (ts.isNamedImports(node.importClause.namedBindings)) {
    const unsupported: string[] = [];

    const imports = node.importClause.namedBindings.elements
      .map((el) => {
        const fileName = this.utils.getDeclarationSourceFile(el.name)?.fileName;
        if (!fileName) return;

        const importedName = el.propertyName?.text ?? el.name.text;

        if (isExternalFileName(fileName)) {
          if (shim?.symbols.has(importedName)) {
            return `import ${shim.haxeModule}.${importedName}${
              el.propertyName
                ? ` as ${this.utils.toHaxeIdentifier(el.name.text)}`
                : ''
            };`;
          }
          unsupported.push(el.getText());
          return;
        }

        return `import ${this.utils.getImportedPackageName(
          fileName,
        )}.${this.utils.toHaxeIdentifier(importedName)}${
          el.propertyName
            ? ` as ${this.utils.toHaxeIdentifier(el.name.text)}`
            : ''
        };`;
      })
      .filter(Boolean);

    if (unsupported.length) {
      logger.warn(
        `Import from an external module is not supported at`,
        this.utils.getNodeSourcePath(node),
      );
      imports.push(
        this.utils.createComment(
          ({ todo }) =>
            `${todo} import { ${unsupported.join(', ')} } from '${moduleName}'`,
        ),
      );
    }

    return imports.filter(Boolean).join('\n');
  }

  // import * as Foo from './foo';
  if (ts.isNamespaceImport(node.importClause.namedBindings)) {
    return this.utils.commentOutNode(node, `Namespace import is not supported`);
  }

  return '';
};

export const transformRenameSymbol: EmitFn = function (
  this: Transpiler,
  node,
  context: VisitNodeContext,
) {
  if (node.pos === -1) return;

  const key = Buffer.from(node.getText()).toString('base64');
  const symbolsMap = this.symbolsToRename[key];
  if (!symbolsMap) return;
  const symbol = this.typeChecker.getSymbolAtLocation(node);
  if (!symbol) return;

  const renameTo = symbolsMap.get(symbol);
  if (renameTo === undefined) return;

  return renameTo;
};
