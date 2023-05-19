import ts, { SyntaxKind } from 'typescript';
import { type Transformer, type TransformerFn } from '../Transformer';

export const transformVariableStatement: TransformerFn = function (
  this: Transformer,
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
  this: Transformer,
  node,
  context,
) {
  // let foo: string, bar = 4
  if (!ts.isVariableDeclarationList(node)) return;
  const keyword = node.flags & ts.NodeFlags.Const ? 'final' : 'var';
  return node.declarations
    .map((dec, i) => {
      const start = `${i > 0 ? this.utils.getIndent(dec) : ''}${keyword} `;

      // { foo: bar = "wow" } = obj
      if (ts.isObjectBindingPattern(dec.name)) {
        const transformBinding = (
          binding: ts.ObjectBindingPattern,
          parentPath: string,
        ): string => {
          return binding.elements
            .map((el) => {
              // { foo: { bar: "baz" } } = obj
              if (ts.isObjectBindingPattern(el.name)) {
                return transformBinding(
                  el.name,
                  `${parentPath}.${this.utils.parenthesize(
                    el.propertyName!,
                    context,
                  )}`,
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
              let init = `${parentPath}.${this.utils.parenthesize(
                el.propertyName ?? el.name,
                context,
              )}`;
              if (el.initializer) {
                init = `${init}.or(${this.visitNode(el.initializer, context)})`;
              }
              return `${start}${el.name.getText()} = ${init}`;
            })
            .join(';\n');
        };

        return transformBinding(
          dec.name,
          this.utils.parenthesize(dec.initializer!, context),
        );
      }

      // [first, , third, ...rest] = arr
      if (ts.isArrayBindingPattern(dec.name)) {
        return dec.name.elements
          .map((el, index) => {
            if (ts.isOmittedExpression(el)) return;

            const name = el.name.getText();
            const init = this.utils.parenthesize(dec.initializer!, context);

            // [...rest] = arr
            if (el.dotDotDotToken) {
              return `${start}${name} = ${init}.slice(${index})`;
            }

            // [first, second] = arr
            return `${start}${name} = ${init}[${index}]`;
          })
          .filter(Boolean)
          .join(';\n');
      }

      return `${start} ${this.visitNode(dec, context).trimStart()}`;
    })
    .join(';\n');
};

export const transformVariableDeclaration: TransformerFn = function (
  this: Transformer,
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
