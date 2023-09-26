import ts, { SyntaxKind } from 'typescript';
import { type Transpiler, type EmitFn } from '../Transpiler';

export const transformVariableStatement: EmitFn = function (
  this: Transpiler,
  node,
  context,
) {
  // /** JS doc */ var foo = "bar";
  if (!ts.isVariableStatement(node)) return;
  // For some reason VariableDeclarationList.getFullText() includes text of
  // JSDoc node from parent VariableStatement thus duplicating this comment
  // when a node is finally dumped after transformation
  this.replaceNodeFullText(node);
  return this.utils.omitChildrenByKind(node, context, SyntaxKind.JSDoc);
};

export const transformVariableDeclarationList: EmitFn = function (
  this: Transpiler,
  node,
  context,
) {
  // let foo: string, bar = 4
  if (!ts.isVariableDeclarationList(node)) return;
  const keyword = node.flags & ts.NodeFlags.Const ? 'final' : 'var';
  const indent = this.utils.getIndent(node);
  return node.declarations
    .map((declaration) =>
      this.visitNode(declaration, {
        ...context,
        variableDeclaration: {
          variableDeclarationIndent: indent,
          variableDeclarationKeyword: keyword,
        },
      }),
    )
    .join('')
    .trimStart();
};

export const transformVariableDeclaration: EmitFn = function (
  this: Transpiler,
  node,
  context,
) {
  // foo: number = 5
  if (!ts.isVariableDeclaration(node)) return;

  const keyword = context.variableDeclaration?.variableDeclarationKeyword;

  if (ts.isIdentifier(node.name)) {
    return `${keyword ? `${keyword} ` : ''}${node.name.text}${
      node.type ? `: ${this.visitNode(node.type, context).trimStart()}` : ''
    }${
      node.initializer
        ? ` = ${this.visitNode(node.initializer, context).trimStart()}`
        : ''
    }`;
  }

  // avoid destructuring of parameter in catch clause
  if (!keyword) {
    return this.utils.commentOutNode(
      node,
      'Parameter destructuring is not allowed in catch clause',
    );
  }

  return this.visitNode(node.name, {
    ...context,
    variableDeclaration: {
      ...context.variableDeclaration,
      variableDeclarationInitializer:
        node.initializer &&
        this.utils.visitParenthesized(node.initializer, context),
    },
  }).trimStart();
};

// { foo: bar = 'baz', [bar]: baz, ...rest } = obj
export const transformObjectBindingPattern: EmitFn = function (
  this: Transpiler,
  node,
  context,
) {
  if (!ts.isObjectBindingPattern(node) || !context.variableDeclaration) {
    return;
  }

  const {
    variableDeclarationIndent = '',
    variableDeclarationKeyword = '',
    variableDeclarationInitializer: parentInitializer = '',
  } = context.variableDeclaration;

  return node.elements
    .map((element) => {
      const propertyName = element.propertyName ?? element.name;
      let initializer = '';

      // { ...rest }
      if (element.dotDotDotToken) {
        const keysToOmit = node.elements
          .filter((e) => e !== element)
          .map((e) => {
            const propName = e.propertyName ?? e.name;

            if (ts.isComputedPropertyName(propName)) {
              return this.visitNode(propName.expression, context).trimStart();
            } else if (
              ts.isIdentifier(propName) ||
              ts.isNumericLiteral(propName) ||
              ts.isStringLiteral(propName)
            ) {
              return `'${propName.text}'`;
            }

            return propName.getText();
          })
          .join(', ');

        return (
          `${variableDeclarationKeyword} ${
            (element.name as ts.Identifier).text
          }` + ` = Ts2hx.rest(${parentInitializer}, [${keysToOmit}])`
        );
      }

      if (ts.isIdentifier(propertyName)) {
        // { foo: bar } = obj -> obj.foo
        initializer = `${parentInitializer}.${propertyName.text}`;
      } else {
        let propertyNameText = '';

        if (
          ts.isNumericLiteral(propertyName) ||
          ts.isStringLiteral(propertyName)
        ) {
          // { 0: bar } = obj -> Reflect.field(obj, '0')
          propertyNameText = `'${propertyName.text}'`;
        } else if (ts.isComputedPropertyName(propertyName)) {
          // { [expression]: bar } = obj -> Reflect.field(obj, expression)
          propertyNameText = this.visitNode(
            propertyName.expression,
            context,
          ).trimStart();
        } else {
          propertyNameText = propertyName.getText();
        }

        initializer = `Reflect.field(${parentInitializer}, ${propertyNameText})`;
      }

      if (element.initializer) {
        initializer = `${initializer} ?? ${this.visitNode(
          element.initializer,
          context,
        ).trimStart()}`;
      }

      // { foo } | { foo: bar } | { [foo]: bar } | { 'foo': bar } | { 0: bar }
      if (ts.isIdentifier(element.name)) {
        return `${variableDeclarationKeyword} ${element.name.text} = ${initializer}`;
      }

      // { foo: { bar } } | { foo: [bar] }
      return this.visitNode(element.name, {
        ...context,
        variableDeclaration: {
          ...context.variableDeclaration,
          variableDeclarationInitializer: element.initializer
            ? `(${initializer})`
            : initializer,
        },
      }).trimStart();
    })
    .join(`;\n${variableDeclarationIndent}`);
};

// [first, , third, ...rest] = arr
export const transformArrayBindingPattern: EmitFn = function (
  this: Transpiler,
  node,
  context,
) {
  if (!ts.isArrayBindingPattern(node) || !context.variableDeclaration) {
    return;
  }

  const {
    variableDeclarationIndent = '',
    variableDeclarationKeyword = '',
    variableDeclarationInitializer: parentInitializer = '',
  } = context.variableDeclaration;

  return node.elements
    .map((element, index) => {
      if (ts.isOmittedExpression(element)) return;

      // [...rest] = arr
      if (element.dotDotDotToken) {
        return (
          `${variableDeclarationKeyword} ${
            (element.name as ts.Identifier).text
          }` + ` = ${parentInitializer}.slice(${index})`
        );
      }

      let initializer = `${parentInitializer}[${index}]`;

      if (element.initializer) {
        initializer = `${initializer} ?? ${this.visitNode(
          element.initializer,
          context,
        ).trimStart()}`;
      }

      // [first, second] = arr
      if (ts.isIdentifier(element.name)) {
        return `${variableDeclarationKeyword} ${element.name.text} = ${initializer}`;
      }

      // [[first, second], { foo }] = arr
      return this.visitNode(element.name, {
        ...context,
        variableDeclaration: {
          ...context.variableDeclaration,
          variableDeclarationInitializer: element.initializer
            ? `(${initializer})`
            : initializer,
        },
      }).trimStart();
    })
    .filter(Boolean)
    .join(`;\n${variableDeclarationIndent}`);
};
