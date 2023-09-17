import ts, { SyntaxKind } from 'typescript';
import { type Transpiler, type TransformerFn } from '../Transpiler';

export const transformVariableStatement: TransformerFn = function (
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

export const transformVariableDeclarationList: TransformerFn = function (
  this: Transpiler,
  node,
  context,
) {
  // let foo: string, bar = 4
  if (!ts.isVariableDeclarationList(node)) return;
  const keyword = node.flags & ts.NodeFlags.Const ? 'final' : 'var';
  return node.declarations
    .map((dec, declarationIndex) => {
      // { foo: bar = "wow" } = obj
      if (ts.isObjectBindingPattern(dec.name)) {
        const transformBinding = (
          binding: ts.ObjectBindingPattern,
          parentPath: string,
          bindingIndex = 0,
        ): string => {
          return binding.elements
            .map((el, elIndex) => {
              const start = `${
                declarationIndex + bindingIndex + elIndex > 0
                  ? this.utils.getIndent(dec)
                  : ''
              }${keyword} `;

              // { foo: { bar: "baz" } } = obj
              if (ts.isObjectBindingPattern(el.name)) {
                return transformBinding(
                  el.name,
                  `${parentPath}.${this.utils
                    .visitParenthesized(el.propertyName!, context)
                    .trimStart()}`,
                  bindingIndex + 1,
                );
              }

              // { ...rest } = obj
              if (el.dotDotDotToken) {
                const keysToOmit = binding.elements
                  .filter((e) => e !== el)
                  .map(
                    (e) => `'${e.propertyName?.getText() ?? e.name.getText()}'`,
                  )
                  .join(', ');
                return `${start}${el.name.getText()} = Ts2hx.rest(${parentPath}, [${keysToOmit}])`;
              }

              // { foo: renamed } = bar
              let init = `${parentPath}.${this.utils
                .visitParenthesized(el.propertyName ?? el.name, context)
                .trimStart()}`;
              if (el.initializer) {
                init = `${init} ?? ${this.visitNode(el.initializer, context)}`;
              }
              return `${start}${el.name.getText()} = ${init}`;
            })
            .join(';\n');
        };

        return transformBinding(
          dec.name,
          this.utils.visitParenthesized(dec.initializer!, context),
        );
      }

      // [first, , third, ...rest] = arr
      if (ts.isArrayBindingPattern(dec.name)) {
        return dec.name.elements
          .map((el, elIndex) => {
            const start = `${
              declarationIndex + elIndex > 0 ? this.utils.getIndent(dec) : ''
            }${keyword} `;
            if (ts.isOmittedExpression(el)) return;

            const name = el.name.getText();
            const init = this.utils.visitParenthesized(
              dec.initializer!,
              context,
            );

            // [...rest] = arr
            if (el.dotDotDotToken) {
              return `${start}${name} = ${init}.slice(${elIndex})`;
            }

            // [first, second] = arr
            return `${start}${name} = ${init}[${elIndex}]`;
          })
          .filter(Boolean)
          .join(';\n');
      }

      const start = `${
        declarationIndex > 0 ? this.utils.getIndent(dec) : ''
      }${keyword} `;
      return `${start} ${this.visitNode(dec, context).trimStart()}`;
    })
    .join(';\n');
};

export const transformVariableDeclaration: TransformerFn = function (
  this: Transpiler,
  node,
  context,
) {
  // foo: number = 5
  if (!ts.isVariableDeclaration(node)) return;
  return `${node.name.getText()}${
    node.type ? `: ${this.visitNode(node.type, context)}` : ''
  }${
    node.initializer ? ` = ${this.visitNode(node.initializer, context)}` : ''
  }`;
};
