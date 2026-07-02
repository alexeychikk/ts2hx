import ts from 'typescript';
import { logger } from '../../Logger';
import { type TransformerFn, type Transpiler } from '../Transpiler';

/**
 * async function foo() { ... } ==>
 * function foo() { return <promise chain>; }
 */
export const transformAsyncFunction: TransformerFn = function (
  this: Transpiler,
  node,
  context,
) {
  if (!this.flags.transformAsyncAwait || !ts.isFunctionDeclaration(node)) {
    return;
  }
  if (!isAsyncFunction(this, node)) return;

  const body = node.body
    ? new AsyncBodyTransformer(this, context).transformBody(node.body)
    : undefined;

  return context.factory.updateFunctionDeclaration(
    node,
    withoutAsyncModifier(node.modifiers),
    node.asteriskToken,
    node.name,
    node.typeParameters,
    node.parameters,
    node.type,
    body,
  );
};

/**
 * const foo = async function () { ... } ==>
 * const foo = function () { return <promise chain>; }
 */
export const transformAsyncFunctionExpression: TransformerFn = function (
  this: Transpiler,
  node,
  context,
) {
  if (!this.flags.transformAsyncAwait || !ts.isFunctionExpression(node)) {
    return;
  }
  if (!isAsyncFunction(this, node)) return;

  return context.factory.updateFunctionExpression(
    node,
    withoutAsyncKeyword(node.modifiers),
    node.asteriskToken,
    node.name,
    node.typeParameters,
    node.parameters,
    node.type,
    new AsyncBodyTransformer(this, context).transformBody(node.body),
  );
};

/**
 * class Foo { async bar() { ... } } ==>
 * class Foo { bar() { return <promise chain>; } }
 */
export const transformAsyncMethod: TransformerFn = function (
  this: Transpiler,
  node,
  context,
) {
  if (!this.flags.transformAsyncAwait || !ts.isMethodDeclaration(node)) return;
  if (!isAsyncFunction(this, node)) return;

  const body = node.body
    ? new AsyncBodyTransformer(this, context).transformBody(node.body)
    : undefined;

  return context.factory.updateMethodDeclaration(
    node,
    withoutAsyncModifier(node.modifiers),
    node.asteriskToken,
    node.name,
    node.questionToken,
    node.typeParameters,
    node.parameters,
    node.type,
    body,
  );
};

/**
 * const foo = async () => { ... } ==>
 * const foo = () => { return <promise chain>; }
 */
export const transformAsyncArrowFunction: TransformerFn = function (
  this: Transpiler,
  node,
  context,
) {
  if (!this.flags.transformAsyncAwait || !ts.isArrowFunction(node)) return;
  if (!isAsyncFunction(this, node)) return;

  const transformer = new AsyncBodyTransformer(this, context);
  let body: ts.ConciseBody;

  if (ts.isBlock(node.body)) {
    body = transformer.transformBody(node.body);
  } else if (
    ts.isAwaitExpression(node.body) &&
    !containsAwait(node.body.expression)
  ) {
    // async () => await promise() ==> () => promise()
    body = node.body.expression;
  } else if (containsAwait(node.body)) {
    // async () => calc(await x()) ==> () => { return <promise chain>; }
    body = transformer.transformBody(
      context.factory.createBlock(
        [context.factory.createReturnStatement(node.body)],
        true,
      ),
    );
  } else {
    // async () => value ==> () => Promise.resolve(value)
    body = transformer.toPromiseExpression(node.body);
  }

  return context.factory.updateArrowFunction(
    node,
    withoutAsyncKeyword(node.modifiers),
    node.typeParameters,
    node.parameters,
    node.type,
    node.equalsGreaterThanToken,
    body,
  );
};

function isAsyncFunction(
  transpiler: Transpiler,
  node:
    | ts.FunctionDeclaration
    | ts.FunctionExpression
    | ts.MethodDeclaration
    | ts.ArrowFunction,
): boolean {
  if (!node.modifiers?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword)) {
    return false;
  }
  if (node.asteriskToken) {
    // Async generators have no direct Promise-based equivalent
    logger.warn(
      `Async generator cannot be converted to a Promise chain at`,
      transpiler.utils.getNodeSourcePath(node),
    );
    return false;
  }
  return true;
}

function withoutAsyncModifier(
  modifiers: ts.NodeArray<ts.ModifierLike> | undefined,
): ts.ModifierLike[] | undefined {
  return modifiers?.filter((m) => m.kind !== ts.SyntaxKind.AsyncKeyword);
}

function withoutAsyncKeyword(
  modifiers: ts.NodeArray<ts.Modifier> | undefined,
): ts.Modifier[] | undefined {
  return modifiers?.filter((m) => m.kind !== ts.SyntaxKind.AsyncKeyword);
}

/** Does this node contain an await expression (not counting nested functions)? */
function containsAwait(node: ts.Node): boolean {
  if (ts.isAwaitExpression(node)) return true;
  if (ts.isFunctionLike(node)) return false;
  return !!ts.forEachChild(node, (child): true | undefined =>
    containsAwait(child) ? true : undefined,
  );
}

interface FlowContext {
  /**
   * The statements being transformed are the body of a loop that is emitted
   * as an AsyncUtils call. `break` and `continue` targeting that loop must be
   * mapped onto the sentinel protocol of AsyncUtils.
   */
  inAsyncLoop: boolean;
  /**
   * The statements being transformed are wrapped in a closure whose
   * synchronous exceptions are converted to rejections (AsyncUtils.tryAsync),
   * so `throw` can be kept as-is.
   */
  inAsyncClosure: boolean;
}

/**
 * Converts the body of an async function into an equivalent function
 * returning a Promise chain. Every `await` is eliminated by turning the rest
 * of the enclosing statement list into a `.then()` continuation. Loops and
 * try/catch containing `await` are expressed through the ts2hx AsyncUtils
 * runtime helpers. Patterns that cannot be converted safely (e.g. `await` in
 * a `while` condition) are left untouched and marked with a TODO comment.
 */
class AsyncBodyTransformer {
  protected tempCounter = 0;

  constructor(
    protected transpiler: Transpiler,
    protected context: ts.TransformationContext,
  ) {}

  protected get factory(): ts.NodeFactory {
    return this.context.factory;
  }

  transformBody(body: ts.Block): ts.Block {
    return this.factory.updateBlock(
      body,
      this.transformStatements(body.statements, {
        inAsyncLoop: false,
        inAsyncClosure: false,
      }),
    );
  }

  /**
   * Transforms a list of statements so that it always completes by returning
   * a Promise and contains no await expressions.
   */
  protected transformStatements(
    statements: readonly ts.Statement[],
    flow: FlowContext,
  ): ts.Statement[] {
    const result: ts.Statement[] = [];

    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      const rest = statements.slice(i + 1);

      if (!containsAwait(statement)) {
        const transformed = this.wrapCompletions(statement, flow);
        result.push(transformed);
        if (this.alwaysExits(transformed)) {
          // The following statements are unreachable, but local function
          // declarations may be referenced from the code above
          result.unshift(...rest.filter(ts.isFunctionDeclaration));
          return result;
        }
        continue;
      }

      result.unshift(...rest.filter(ts.isFunctionDeclaration));
      result.push(
        ...this.transformAwaitingStatement(
          statement,
          rest.filter((s) => !ts.isFunctionDeclaration(s)),
          flow,
        ),
      );
      return result;
    }

    result.push(this.createReturnResolve());
    return result;
  }

  /**
   * Transforms the first statement containing await together with all the
   * statements that follow it (which become the continuation).
   */
  protected transformAwaitingStatement(
    statement: ts.Statement,
    rest: ts.Statement[],
    flow: FlowContext,
  ): ts.Statement[] {
    if (ts.isIfStatement(statement) && !containsAwait(statement.expression)) {
      return this.transformIf(statement, rest, flow);
    }

    if (ts.isTryStatement(statement)) {
      return this.transformTry(statement, rest, flow);
    }

    if (ts.isWhileStatement(statement) || ts.isDoStatement(statement)) {
      if (containsAwait(statement.expression)) {
        return this.todoFallback(
          statement,
          rest,
          flow,
          `'await' in a loop condition is not supported`,
        );
      }
      return this.transformWhile(statement, rest, flow);
    }

    if (ts.isForStatement(statement)) {
      return this.transformFor(statement, rest, flow);
    }

    if (
      (ts.isForOfStatement(statement) || ts.isForInStatement(statement)) &&
      !containsAwait(statement.expression)
    ) {
      return this.transformForEach(statement, rest, flow);
    }

    if (
      ts.isReturnStatement(statement) &&
      statement.expression &&
      ts.isAwaitExpression(statement.expression) &&
      !containsAwait(statement.expression.expression)
    ) {
      // return await promise() ==> return promise()
      return [
        this.factory.createReturnStatement(
          this.toPromiseExpression(statement.expression.expression),
        ),
      ];
    }

    if (
      ts.isExpressionStatement(statement) &&
      ts.isAwaitExpression(statement.expression) &&
      !containsAwait(statement.expression.expression)
    ) {
      // await promise(); <rest> ==> return promise().then(_ => { <rest> });
      return [
        this.createReturnThen(
          statement.expression.expression,
          this.createIgnoredParameter(),
          this.transformStatements(rest, flow),
        ),
      ];
    }

    const variableWithAwait =
      this.matchVariableWithAwaitedInitializer(statement);
    if (variableWithAwait) {
      // const x = await promise(); <rest> ==>
      // return promise().then(x => { <rest> });
      const { declaration, awaited } = variableWithAwait;
      return this.transformAwaitedVariable(
        statement as ts.VariableStatement,
        declaration,
        awaited,
        rest,
        flow,
      );
    }

    if (
      ts.isExpressionStatement(statement) ||
      ts.isVariableStatement(statement) ||
      ts.isReturnStatement(statement) ||
      ts.isThrowStatement(statement) ||
      ts.isIfStatement(statement)
    ) {
      return this.hoistFirstAwait(statement, rest, flow);
    }

    return this.todoFallback(
      statement,
      rest,
      flow,
      `'await' inside a '${ts.SyntaxKind[statement.kind]}' is not supported`,
    );
  }

  /**
   * Extracts the first await expression (in evaluation order) of a statement
   * into a `.then()` parameter:
   * foo(await bar()); ==> return bar().then(_awaited => { foo(_awaited); });
   */
  protected hoistFirstAwait(
    statement: ts.Statement,
    rest: ts.Statement[],
    flow: FlowContext,
  ): ts.Statement[] {
    const awaited = this.findFirstAwait(statement);
    if (!awaited)
      return this.todoFallback(
        statement,
        rest,
        flow,
        `'await' could not be transformed`,
      );

    if (this.isConditionallyEvaluated(awaited, statement)) {
      return this.todoFallback(
        statement,
        rest,
        flow,
        `conditionally evaluated 'await' (in '&&', '||', '??' or '?:') is not supported`,
      );
    }

    const temp = this.createTempIdentifier();
    const replaced = this.replaceNode(statement, awaited, temp) as ts.Statement;

    return [
      this.createReturnThen(
        awaited.expression,
        this.factory.createParameterDeclaration(
          undefined,
          undefined,
          temp,
          undefined,
          undefined,
          undefined,
        ),
        this.transformStatements([replaced, ...rest], flow),
      ),
    ];
  }

  protected transformAwaitedVariable(
    statement: ts.VariableStatement,
    declaration: ts.VariableDeclaration,
    awaited: ts.AwaitExpression,
    rest: ts.Statement[],
    flow: FlowContext,
  ): ts.Statement[] {
    const declarations = statement.declarationList.declarations;
    const index = declarations.indexOf(declaration);
    const result: ts.Statement[] = [];

    // const a = 1, b = await p(), c = b + 1; ==>
    // const a = 1; return p().then(b => { const c = b + 1; ... });
    if (index > 0) {
      result.push(
        this.factory.createVariableStatement(
          undefined,
          this.factory.createVariableDeclarationList(
            declarations.slice(0, index),
            statement.declarationList.flags,
          ),
        ),
      );
    }

    const continuation = [...rest];
    if (index < declarations.length - 1) {
      continuation.unshift(
        this.factory.createVariableStatement(
          undefined,
          this.factory.createVariableDeclarationList(
            declarations.slice(index + 1),
            statement.declarationList.flags,
          ),
        ),
      );
    }

    let parameterName: ts.BindingName = declaration.name;
    if (!ts.isIdentifier(declaration.name)) {
      // Destructured declarations cannot become a callback parameter,
      // so assign the awaited value to a temp first
      const temp = this.createTempIdentifier();
      continuation.unshift(
        this.factory.createVariableStatement(
          undefined,
          this.factory.createVariableDeclarationList(
            [
              this.factory.createVariableDeclaration(
                declaration.name,
                undefined,
                declaration.type,
                temp,
              ),
            ],
            statement.declarationList.flags,
          ),
        ),
      );
      parameterName = temp;
    }

    result.push(
      this.createReturnThen(
        awaited.expression,
        this.factory.createParameterDeclaration(
          undefined,
          undefined,
          parameterName,
          undefined,
          undefined,
          undefined,
        ),
        this.transformStatements(continuation, flow),
      ),
    );

    return result;
  }

  protected transformIf(
    statement: ts.IfStatement,
    rest: ts.Statement[],
    flow: FlowContext,
  ): ts.Statement[] {
    const thenStatements = this.toStatements(statement.thenStatement);
    const elseStatements = statement.elseStatement
      ? this.toStatements(statement.elseStatement)
      : undefined;

    if (rest.length === 0) {
      const result: ts.Statement[] = [
        this.factory.updateIfStatement(
          statement,
          statement.expression,
          this.factory.createBlock(
            this.transformStatements(thenStatements, flow),
            true,
          ),
          elseStatements
            ? this.factory.createBlock(
                this.transformStatements(elseStatements, flow),
                true,
              )
            : undefined,
        ),
      ];
      if (!elseStatements) result.push(this.createReturnResolve());
      return result;
    }

    const hasEscapingFlow =
      this.containsEscapingFlow(thenStatements) ||
      (!!elseStatements && this.containsEscapingFlow(elseStatements));

    if (hasEscapingFlow) {
      // A branch may exit early (return/break/continue), so the continuation
      // cannot be chained after the whole if. Instead, the continuation is
      // duplicated into both branches which makes the if exhaustive.
      return [
        this.factory.updateIfStatement(
          statement,
          statement.expression,
          this.factory.createBlock(
            this.transformStatements([...thenStatements, ...rest], flow),
            true,
          ),
          this.factory.createBlock(
            this.transformStatements(
              [...(elseStatements ?? []), ...rest],
              flow,
            ),
            true,
          ),
        ),
      ];
    }

    // if (c) { await a(); } else { await b(); } <rest> ==>
    // return (c ? (() => { ... })() : (() => { ... })()).then(_ => { <rest> });
    const condition = this.factory.createParenthesizedExpression(
      this.factory.createConditionalExpression(
        statement.expression,
        this.factory.createToken(ts.SyntaxKind.QuestionToken),
        this.toPromiseIife(thenStatements, flow),
        this.factory.createToken(ts.SyntaxKind.ColonToken),
        elseStatements
          ? this.toPromiseIife(elseStatements, flow)
          : this.createPromiseResolve(),
      ),
    );

    return [
      this.createReturnThen(
        condition,
        this.createIgnoredParameter(),
        this.transformStatements(rest, flow),
      ),
    ];
  }

  protected transformWhile(
    statement: ts.WhileStatement | ts.DoStatement,
    rest: ts.Statement[],
    flow: FlowContext,
  ): ts.Statement[] {
    const call = this.createAsyncUtilsCall(
      ts.isDoStatement(statement) ? 'doWhileAsync' : 'whileAsync',
      [
        this.createArrowFunction([], statement.expression),
        this.createLoopBodyCallback([], statement.statement),
      ],
    );
    return this.chainAfterLoop(statement, call, rest, flow);
  }

  protected transformFor(
    statement: ts.ForStatement,
    rest: ts.Statement[],
    flow: FlowContext,
  ): ts.Statement[] {
    const canonical = this.matchCanonicalForLoop(statement);
    if (!canonical) {
      return this.todoFallback(
        statement,
        rest,
        flow,
        `only 'for' loops of shape 'for (let i = <start>; i < <end>; i++)' can contain 'await'`,
      );
    }

    const call = this.createAsyncUtilsCall('asyncLoop', [
      canonical.start,
      canonical.end,
      this.createLoopBodyCallback(
        [this.createParameter(canonical.iterator)],
        statement.statement,
      ),
    ]);
    return this.chainAfterLoop(statement, call, rest, flow);
  }

  protected transformForEach(
    statement: ts.ForOfStatement | ts.ForInStatement,
    rest: ts.Statement[],
    flow: FlowContext,
  ): ts.Statement[] {
    const iterable = ts.isForInStatement(statement)
      ? // for-in iterates object keys; Reflect.fields is the Haxe equivalent
        this.factory.createCallExpression(
          this.factory.createPropertyAccessExpression(
            this.factory.createIdentifier('Reflect'),
            this.factory.createIdentifier('fields'),
          ),
          undefined,
          [statement.expression],
        )
      : statement.expression;

    const bodyStatements = this.toStatements(statement.statement);
    let parameterName: ts.BindingName | undefined;

    if (ts.isVariableDeclarationList(statement.initializer)) {
      const name = statement.initializer.declarations[0].name;
      if (ts.isIdentifier(name)) {
        parameterName = name;
      } else {
        // for (const [a, b] of pairs) — bind to a temp and destructure inside
        const temp = this.createTempIdentifier();
        bodyStatements.unshift(
          this.factory.createVariableStatement(
            undefined,
            this.factory.createVariableDeclarationList(
              [
                this.factory.createVariableDeclaration(
                  name,
                  undefined,
                  undefined,
                  temp,
                ),
              ],
              statement.initializer.flags,
            ),
          ),
        );
        parameterName = temp;
      }
    } else {
      // for (existingVar of items)
      const temp = this.createTempIdentifier();
      bodyStatements.unshift(
        this.factory.createExpressionStatement(
          this.factory.createBinaryExpression(
            statement.initializer,
            this.factory.createToken(ts.SyntaxKind.EqualsToken),
            temp,
          ),
        ),
      );
      parameterName = temp;
    }

    const call = this.createAsyncUtilsCall('forEachAsync', [
      iterable,
      this.createLoopBodyCallback(
        [this.createParameter(parameterName)],
        this.factory.createBlock(bodyStatements, true),
      ),
    ]);
    return this.chainAfterLoop(statement, call, rest, flow);
  }

  protected transformTry(
    statement: ts.TryStatement,
    rest: ts.Statement[],
    flow: FlowContext,
  ): ts.Statement[] {
    const innerFlow: FlowContext = { ...flow, inAsyncClosure: true };

    const args: ts.Expression[] = [
      this.createArrowFunction(
        [],
        this.factory.createBlock(
          this.transformStatements(statement.tryBlock.statements, innerFlow),
          true,
        ),
      ),
    ];

    if (statement.catchClause) {
      const declaration = statement.catchClause.variableDeclaration;
      let parameterName: ts.BindingName =
        declaration?.name ?? this.createTempIdentifier();
      const catchStatements = [...statement.catchClause.block.statements];

      if (declaration && !ts.isIdentifier(declaration.name)) {
        const temp = this.createTempIdentifier();
        catchStatements.unshift(
          this.factory.createVariableStatement(
            undefined,
            this.factory.createVariableDeclarationList(
              [
                this.factory.createVariableDeclaration(
                  declaration.name,
                  undefined,
                  undefined,
                  temp,
                ),
              ],
              ts.NodeFlags.Const,
            ),
          ),
        );
        parameterName = temp;
      }

      args.push(
        this.createArrowFunction(
          [this.createParameter(parameterName)],
          this.factory.createBlock(
            this.transformStatements(catchStatements, innerFlow),
            true,
          ),
        ),
      );
    } else if (statement.finallyBlock) {
      args.push(this.factory.createIdentifier('undefined'));
    }

    if (statement.finallyBlock) {
      args.push(
        this.createArrowFunction(
          [],
          this.factory.createBlock(
            this.transformStatements(statement.finallyBlock.statements, {
              inAsyncLoop: false,
              inAsyncClosure: true,
            }),
            true,
          ),
        ),
      );
    }

    const call = this.createAsyncUtilsCall('tryAsync', args);

    if (rest.length === 0) {
      return [this.factory.createReturnStatement(call)];
    }

    // With a continuation after the try, early returns inside try/catch
    // cannot skip it — unless every path through the try returns anyway
    const exitPaths = [
      this.statementsAlwaysExit([...statement.tryBlock.statements]),
      statement.catchClause
        ? this.statementsAlwaysExit([...statement.catchClause.block.statements])
        : // no catch — an exception path never falls through to the rest
          true,
    ];
    if (exitPaths.every(Boolean)) {
      return [this.factory.createReturnStatement(call)];
    }

    if (
      this.containsEscapingReturn([...statement.tryBlock.statements]) ||
      (statement.catchClause &&
        this.containsEscapingReturn([
          ...statement.catchClause.block.statements,
        ]))
    ) {
      this.addTodoComment(
        statement,
        `'return' inside 'try' followed by more code cannot short-circuit the Promise chain`,
      );
    }

    return this.chainAfterLoop(statement, call, rest, flow, true);
  }

  /**
   * Emits `return <loopOrTryCall>...;` optionally followed by the transformed
   * continuation, propagating the BREAK sentinel to an enclosing async loop
   * when necessary.
   */
  protected chainAfterLoop(
    statement: ts.Statement,
    call: ts.Expression,
    rest: ts.Statement[],
    flow: FlowContext,
    propagateBreak = false,
  ): ts.Statement[] {
    if (rest.length === 0) {
      return [this.factory.createReturnStatement(call)];
    }

    const continuation = this.transformStatements(rest, flow);

    if (
      propagateBreak &&
      flow.inAsyncLoop &&
      this.containsEscapingFlow([statement])
    ) {
      // A break inside try/catch resolves tryAsync with the BREAK sentinel;
      // pass it through to the enclosing loop instead of continuing
      const result = this.createTempIdentifier();
      continuation.unshift(
        this.factory.createIfStatement(
          this.factory.createBinaryExpression(
            result,
            this.factory.createToken(ts.SyntaxKind.EqualsEqualsEqualsToken),
            this.createAsyncUtilsBreak(),
          ),
          this.factory.createReturnStatement(
            this.createPromiseResolve(this.createAsyncUtilsBreak()),
          ),
        ),
      );
      return [
        this.createReturnThen(call, this.createParameter(result), continuation),
      ];
    }

    return [
      this.createReturnThen(call, this.createIgnoredParameter(), continuation),
    ];
  }

  /**
   * Fallback for constructs that cannot be converted: warn, keep the
   * statement as-is (its awaits will show up as @:await metadata in the
   * output) and continue with the rest of the statements.
   */
  protected todoFallback(
    statement: ts.Statement,
    rest: ts.Statement[],
    flow: FlowContext,
    message: string,
  ): ts.Statement[] {
    this.addTodoComment(statement, message);
    return [statement, ...this.transformStatements(rest, flow)];
  }

  protected addTodoComment(statement: ts.Statement, message: string): void {
    logger.warn(
      message,
      'at',
      // Nodes produced during the transformation are detached
      // from the source file, so their position cannot be resolved
      statement.pos !== -1 && statement.getSourceFile()
        ? this.transpiler.utils.getNodeSourcePath(statement)
        : this.transpiler.sourceFile.fileName,
    );
    const { includeComments, includeTodos } = this.transpiler.flags;
    if (!includeComments && !includeTodos) return;
    ts.addSyntheticLeadingComment(
      statement,
      ts.SyntaxKind.MultiLineCommentTrivia,
      ` ${includeTodos ? 'TODO(ts2hx)' : 'ts2hx'}: ${message} `,
      true,
    );
  }

  /**
   * Rewrites completions of an await-free statement inside an async function:
   * - return values are wrapped into Promise.resolve()
   * - top-level throws become Promise.reject() (an async function rejects
   *   rather than throwing synchronously)
   * - break/continue targeting an enclosing AsyncUtils-driven loop are
   *   expressed through the sentinel protocol
   */
  protected wrapCompletions(
    statement: ts.Statement,
    flow: FlowContext,
  ): ts.Statement {
    const visit = (node: ts.Node, local: FlowContext): ts.Node => {
      if (ts.isFunctionLike(node)) return node;

      if (ts.isReturnStatement(node)) {
        return this.factory.createReturnStatement(
          node.expression
            ? this.toPromiseExpression(node.expression)
            : this.createPromiseResolve(),
        );
      }

      if (ts.isThrowStatement(node) && !local.inAsyncClosure) {
        return this.factory.createReturnStatement(
          this.createPromiseCall('reject', [node.expression]),
        );
      }

      if (ts.isBreakStatement(node) && !node.label && local.inAsyncLoop) {
        return this.factory.createReturnStatement(
          this.createPromiseResolve(this.createAsyncUtilsBreak()),
        );
      }

      if (ts.isContinueStatement(node) && !node.label && local.inAsyncLoop) {
        return this.factory.createReturnStatement(this.createPromiseResolve());
      }

      let childFlow = local;
      if (ts.isIterationStatement(node, false) || ts.isSwitchStatement(node)) {
        // break/continue inside belong to this synchronous construct
        childFlow = { ...childFlow, inAsyncLoop: false };
      }
      if (ts.isTryStatement(node) || ts.isCatchClause(node)) {
        // 'throw' inside try/catch may be handled locally — keep it
        childFlow = { ...childFlow, inAsyncClosure: true };
      }

      return ts.visitEachChild(
        node,
        (child) => visit(child, childFlow),
        this.context,
      );
    };

    return visit(statement, flow) as ts.Statement;
  }

  /** Wraps an expression into Promise.resolve() unless it is already a Promise */
  toPromiseExpression(expression: ts.Expression): ts.Expression {
    const isPromiseConstruction =
      ts.isNewExpression(expression) &&
      ts.isIdentifier(expression.expression) &&
      expression.expression.text === 'Promise';

    if (
      isPromiseConstruction ||
      this.transpiler.utils.isCallOf(expression, 'Promise.*') ||
      (ts.isCallExpression(expression) &&
        this.transpiler.utils.returnsPromise(expression))
    ) {
      return expression;
    }
    return this.createPromiseResolve(expression);
  }

  /**
   * The target of a generated `.then()` call. Await operands are practically
   * always Promises, so only obvious non-Promise literals get wrapped.
   */
  protected toThenTarget(expression: ts.Expression): ts.Expression {
    if (
      ts.isLiteralExpression(expression) ||
      ts.isArrayLiteralExpression(expression) ||
      ts.isObjectLiteralExpression(expression) ||
      expression.kind === ts.SyntaxKind.TrueKeyword ||
      expression.kind === ts.SyntaxKind.FalseKeyword ||
      expression.kind === ts.SyntaxKind.NullKeyword
    ) {
      return this.createPromiseResolve(expression);
    }
    return expression;
  }

  // --- statement analysis ---

  protected matchVariableWithAwaitedInitializer(
    statement: ts.Statement,
  ):
    | { declaration: ts.VariableDeclaration; awaited: ts.AwaitExpression }
    | undefined {
    if (!ts.isVariableStatement(statement)) return;

    for (const declaration of statement.declarationList.declarations) {
      if (!declaration.initializer) continue;
      if (
        ts.isAwaitExpression(declaration.initializer) &&
        !containsAwait(declaration.initializer.expression)
      ) {
        return { declaration, awaited: declaration.initializer };
      }
      if (containsAwait(declaration)) return; // handled by hoisting instead
    }
  }

  protected matchCanonicalForLoop(
    statement: ts.ForStatement,
  ):
    | { iterator: ts.Identifier; start: ts.Expression; end: ts.Expression }
    | undefined {
    const { initializer, condition, incrementor } = statement;
    if (!initializer || !condition || !incrementor) return;
    if (
      containsAwait(initializer) ||
      containsAwait(condition) ||
      containsAwait(incrementor)
    ) {
      return;
    }

    if (
      !ts.isVariableDeclarationList(initializer) ||
      initializer.declarations.length !== 1
    ) {
      return;
    }
    const declaration = initializer.declarations[0];
    if (!ts.isIdentifier(declaration.name) || !declaration.initializer) return;
    const iterator = declaration.name;

    if (
      !ts.isBinaryExpression(condition) ||
      condition.operatorToken.kind !== ts.SyntaxKind.LessThanToken ||
      !ts.isIdentifier(condition.left) ||
      condition.left.text !== iterator.text
    ) {
      return;
    }

    const isIncrement =
      (ts.isPostfixUnaryExpression(incrementor) ||
        ts.isPrefixUnaryExpression(incrementor)) &&
      incrementor.operator === ts.SyntaxKind.PlusPlusToken &&
      ts.isIdentifier(incrementor.operand) &&
      incrementor.operand.text === iterator.text;
    if (!isIncrement) return;

    return { iterator, start: declaration.initializer, end: condition.right };
  }

  /** Finds the first await expression in evaluation order (innermost first) */
  protected findFirstAwait(node: ts.Node): ts.AwaitExpression | undefined {
    if (ts.isFunctionLike(node)) return;
    const inner = ts.forEachChild(node, (child) => this.findFirstAwait(child));
    if (inner) return inner;
    return ts.isAwaitExpression(node) ? node : undefined;
  }

  /**
   * True when the expression might not be evaluated (short-circuit operators,
   * ternaries) — hoisting it out of the statement would change semantics.
   */
  protected isConditionallyEvaluated(
    target: ts.Node,
    root: ts.Statement,
  ): boolean {
    let result = false;

    const visit = (node: ts.Node, conditional: boolean): void => {
      if (result) return;
      if (node === target) {
        result = conditional;
        return;
      }
      if (ts.isFunctionLike(node)) return;

      if (
        ts.isBinaryExpression(node) &&
        [
          ts.SyntaxKind.AmpersandAmpersandToken,
          ts.SyntaxKind.BarBarToken,
          ts.SyntaxKind.QuestionQuestionToken,
        ].includes(node.operatorToken.kind)
      ) {
        visit(node.left, conditional);
        visit(node.right, true);
        return;
      }
      if (ts.isConditionalExpression(node)) {
        visit(node.condition, conditional);
        visit(node.whenTrue, true);
        visit(node.whenFalse, true);
        return;
      }

      ts.forEachChild(node, (child) => {
        visit(child, conditional);
      });
    };

    visit(root, false);
    return result;
  }

  /** Does the (transformed) statement definitely exit on every code path? */
  protected alwaysExits(statement: ts.Statement): boolean {
    if (ts.isReturnStatement(statement) || ts.isThrowStatement(statement)) {
      return true;
    }
    if (ts.isBlock(statement)) {
      return statement.statements.some((s) => this.alwaysExits(s));
    }
    if (ts.isIfStatement(statement)) {
      return (
        !!statement.elseStatement &&
        this.alwaysExits(statement.thenStatement) &&
        this.alwaysExits(statement.elseStatement)
      );
    }
    return false;
  }

  protected statementsAlwaysExit(statements: ts.Statement[]): boolean {
    return statements.some((s) => this.alwaysExits(s));
  }

  /** Any return/break/continue escaping the given statements? */
  protected containsEscapingFlow(statements: readonly ts.Statement[]): boolean {
    return statements.some((s) => this.findEscaping(s, true) !== undefined);
  }

  protected containsEscapingReturn(
    statements: readonly ts.Statement[],
  ): boolean {
    return statements.some((s) => this.findEscaping(s, false) !== undefined);
  }

  protected findEscaping(
    node: ts.Node,
    includeBreakContinue: boolean,
    breakable = false,
  ): ts.Node | undefined {
    if (ts.isFunctionLike(node)) return;
    if (ts.isReturnStatement(node)) return node;
    if (
      includeBreakContinue &&
      !breakable &&
      !(node as ts.BreakOrContinueStatement).label &&
      (ts.isBreakStatement(node) || ts.isContinueStatement(node))
    ) {
      return node;
    }
    const childBreakable =
      breakable ||
      ts.isIterationStatement(node, false) ||
      ts.isSwitchStatement(node);
    return ts.forEachChild(node, (child) =>
      this.findEscaping(child, includeBreakContinue, childBreakable),
    );
  }

  // --- node factory helpers ---

  protected toStatements(statement: ts.Statement): ts.Statement[] {
    return ts.isBlock(statement) ? [...statement.statements] : [statement];
  }

  protected replaceNode(
    root: ts.Node,
    target: ts.Node,
    replacement: ts.Node,
  ): ts.Node {
    const visit = (node: ts.Node): ts.Node =>
      node === target
        ? replacement
        : ts.visitEachChild(node, visit, this.context);
    return visit(root);
  }

  protected createTempIdentifier(): ts.Identifier {
    this.tempCounter += 1;
    return this.factory.createIdentifier(
      `_awaited${this.tempCounter > 1 ? this.tempCounter : ''}`,
    );
  }

  protected createParameter(name: ts.BindingName): ts.ParameterDeclaration {
    return this.factory.createParameterDeclaration(
      undefined,
      undefined,
      name,
      undefined,
      undefined,
      undefined,
    );
  }

  protected createIgnoredParameter(): ts.ParameterDeclaration {
    return this.createParameter(this.factory.createIdentifier('_'));
  }

  protected createArrowFunction(
    parameters: ts.ParameterDeclaration[],
    body: ts.ConciseBody,
  ): ts.ArrowFunction {
    return this.factory.createArrowFunction(
      undefined,
      undefined,
      parameters,
      undefined,
      this.factory.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
      body,
    );
  }

  protected createLoopBodyCallback(
    parameters: ts.ParameterDeclaration[],
    body: ts.Statement,
  ): ts.ArrowFunction {
    const statements = this.toStatements(body);
    if (this.containsEscapingReturn(statements)) {
      this.addTodoComment(
        body,
        `'return' inside a loop with 'await' does not stop the loop`,
      );
    }
    return this.createArrowFunction(
      parameters,
      this.factory.createBlock(
        this.transformStatements(statements, {
          inAsyncLoop: true,
          inAsyncClosure: true,
        }),
        true,
      ),
    );
  }

  protected toPromiseIife(
    statements: ts.Statement[],
    flow: FlowContext,
  ): ts.Expression {
    return this.factory.createCallExpression(
      this.factory.createParenthesizedExpression(
        this.createArrowFunction(
          [],
          this.factory.createBlock(
            this.transformStatements(statements, flow),
            true,
          ),
        ),
      ),
      undefined,
      [],
    );
  }

  protected createReturnThen(
    target: ts.Expression,
    parameter: ts.ParameterDeclaration | ts.Identifier,
    continuation: ts.Statement[],
  ): ts.ReturnStatement {
    return this.factory.createReturnStatement(
      this.factory.createCallExpression(
        this.factory.createPropertyAccessExpression(
          this.toThenTarget(target),
          this.factory.createIdentifier('then'),
        ),
        undefined,
        [
          this.createArrowFunction(
            [
              ts.isIdentifier(parameter)
                ? this.createParameter(parameter)
                : parameter,
            ],
            this.factory.createBlock(continuation, true),
          ),
        ],
      ),
    );
  }

  protected createPromiseCall(
    method: 'resolve' | 'reject',
    args: ts.Expression[],
  ): ts.Expression {
    return this.factory.createCallExpression(
      this.factory.createPropertyAccessExpression(
        this.factory.createIdentifier('Promise'),
        this.factory.createIdentifier(method),
      ),
      undefined,
      args,
    );
  }

  protected createPromiseResolve(value?: ts.Expression): ts.Expression {
    return this.createPromiseCall('resolve', value ? [value] : []);
  }

  protected createReturnResolve(): ts.ReturnStatement {
    return this.factory.createReturnStatement(this.createPromiseResolve());
  }

  protected createAsyncUtilsCall(
    method: string,
    args: ts.Expression[],
  ): ts.Expression {
    return this.factory.createCallExpression(
      this.factory.createPropertyAccessExpression(
        this.factory.createIdentifier('AsyncUtils'),
        this.factory.createIdentifier(method),
      ),
      undefined,
      args,
    );
  }

  protected createAsyncUtilsBreak(): ts.Expression {
    return this.factory.createPropertyAccessExpression(
      this.factory.createIdentifier('AsyncUtils'),
      this.factory.createIdentifier('BREAK'),
    );
  }
}
