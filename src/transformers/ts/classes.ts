import ts, { SyntaxKind } from 'typescript';
import { groupBy } from 'lodash';
import { logger } from '../../Logger';
import { type TransformerFn, type Transpiler } from '../Transpiler';

/**
 * Haxe does not allow `this` access in field initializers — move such
 * initializers into the constructor (after the super() call):
 * class Foo { bar = () => this.baz(); } ==>
 * class Foo { bar: () => any; constructor() { this.bar = () => this.baz(); } }
 */
export const transformFieldInitializersUsingThis: TransformerFn = function (
  this: Transpiler,
  node,
  context,
) {
  if (!ts.isClassLike(node)) return;

  // fields redeclaring a base class field are not allowed in Haxe —
  // they are dropped (with their initializers moved to the constructor)
  let baseType: ts.Type | undefined;
  const heritageNode = this.utils.getExtendedNode(node);
  if (heritageNode && heritageNode.pos !== -1) {
    try {
      baseType = this.typeChecker.getTypeAtLocation(heritageNode);
    } catch {
      baseType = undefined;
    }
  }

  const instanceFields = node.members.filter(
    (member): member is ts.PropertyDeclaration =>
      ts.isPropertyDeclaration(member) &&
      !member.modifiers?.some((mod) => mod.kind === SyntaxKind.StaticKeyword) &&
      ts.isIdentifier(member.name),
  );
  const redeclaresBaseField = (field: ts.PropertyDeclaration): boolean =>
    !!baseType?.getProperty((field.name as ts.Identifier).text);

  let fieldsToMove = instanceFields.filter(
    (field) =>
      !!field.initializer &&
      (referencesThis(field.initializer) || redeclaresBaseField(field)),
  );

  // methods implementing an OPTIONAL base method — the base emits a
  // nullable function field, so the implementation must be assigned
  // in the constructor
  const getOptionalBaseMethod = (
    name: string,
  ): ts.MethodDeclaration | ts.MethodSignature | undefined =>
    baseType
      ?.getProperty(name)
      ?.declarations?.find(
        (declaration): declaration is ts.MethodDeclaration =>
          (ts.isMethodDeclaration(declaration) ||
            ts.isMethodSignature(declaration)) &&
          !!declaration.questionToken &&
          !(declaration as ts.MethodDeclaration).body,
      );
  const implementsOptionalBaseMethod = (name: string): boolean =>
    !!getOptionalBaseMethod(name);
  const methodsToMove = node.members.filter(
    (member): member is ts.MethodDeclaration =>
      ts.isMethodDeclaration(member) &&
      !member.modifiers?.some((mod) => mod.kind === SyntaxKind.StaticKeyword) &&
      ts.isIdentifier(member.name) &&
      !!member.body &&
      implementsOptionalBaseMethod(member.name.text),
  );

  if (
    !fieldsToMove.length &&
    !methodsToMove.length &&
    !instanceFields.some(
      (field) => !field.initializer && redeclaresBaseField(field),
    )
  ) {
    return;
  }

  const constructorDeclaration = node.members.find(ts.isConstructorDeclaration);
  const factory = context.factory;

  // a synthesized constructor of a derived class must forward the base
  // constructor parameters into a super() call
  let superParameterNames: string[] | undefined;
  if (
    (fieldsToMove.length || methodsToMove.length) &&
    !constructorDeclaration?.body &&
    this.utils.getExtendedNode(node)
  ) {
    superParameterNames = getBaseConstructorParameterNames.call(this, node);
    if (!superParameterNames) {
      logger.warn(
        `Field initializer cannot be moved to a constructor at`,
        node.pos !== -1 && node.getSourceFile()
          ? this.utils.getNodeSourcePath(node)
          : this.sourceFile.fileName,
      );
      if (
        !instanceFields.some(
          (field) => !field.initializer && redeclaresBaseField(field),
        )
      ) {
        return;
      }
      // at least drop the initializer-less redeclarations
      fieldsToMove = [];
    }
  }

  // redeclarations of base class fields are dropped: their initializers
  // move to the constructor, their types are declared by the base class
  const fieldsToDrop = instanceFields.filter(
    (field) =>
      redeclaresBaseField(field) &&
      (!field.initializer || fieldsToMove.includes(field)),
  );

  const createAssignment = (
    name: string,
    value: ts.Expression,
  ): ts.ExpressionStatement =>
    factory.createExpressionStatement(
      factory.createBinaryExpression(
        factory.createPropertyAccessExpression(
          factory.createThis(),
          // a fresh identifier — the original one may carry JSDoc trivia
          // that must not be printed in the middle of an expression
          factory.createIdentifier(name),
        ),
        factory.createToken(SyntaxKind.EqualsToken),
        value,
      ),
    );

  const assignments = [
    ...fieldsToMove.map((field) =>
      createAssignment((field.name as ts.Identifier).text, field.initializer!),
    ),
    ...methodsToMove.map((method) => {
      // the assigned function must match the field's arity exactly —
      // pad parameters the TS implementation omitted
      const parameters = [...method.parameters];
      const baseMethod = getOptionalBaseMethod(
        (method.name as ts.Identifier).text,
      );
      for (const baseParameter of baseMethod?.parameters.slice(
        parameters.length,
      ) ?? []) {
        parameters.push(
          factory.createParameterDeclaration(
            undefined,
            undefined,
            ts.isIdentifier(baseParameter.name)
              ? `_${baseParameter.name.text}`
              : '_ignored',
            undefined,
            undefined,
            undefined,
          ),
        );
      }
      return createAssignment(
        (method.name as ts.Identifier).text,
        factory.createFunctionExpression(
          undefined,
          undefined,
          undefined,
          method.typeParameters,
          parameters,
          method.type,
          method.body!,
        ),
      );
    }),
  ];

  let newMembers: ts.ClassElement[] = node.members
    .filter(
      (member) =>
        !fieldsToDrop.includes(member as ts.PropertyDeclaration) &&
        !methodsToMove.includes(member as ts.MethodDeclaration),
    )
    .map((member) => {
      if (!fieldsToMove.includes(member as ts.PropertyDeclaration)) {
        return member;
      }
      const field = member as ts.PropertyDeclaration;
      // the field keeps (or gets) an explicit type — the initializer that
      // used to imply it is moving away
      let typeNode = field.type;
      if (!typeNode && field.pos !== -1) {
        try {
          typeNode = this.typeChecker.typeToTypeNode(
            this.typeChecker.getTypeAtLocation(field),
            node,
            ts.NodeBuilderFlags.NoTruncation,
          );
        } catch {
          // nodes detached from the source tree cannot be resolved
        }
      }
      typeNode ??= factory.createTypeReferenceNode('Any');
      return factory.updatePropertyDeclaration(
        field,
        field.modifiers,
        field.name,
        field.questionToken,
        typeNode,
        undefined,
      );
    });

  if (constructorDeclaration?.body) {
    const statements = [...constructorDeclaration.body.statements];
    const superIndex = statements.findIndex((statement) =>
      this.utils.isSuperExpression(statement),
    );
    statements.splice(superIndex + 1, 0, ...assignments);

    const newConstructor = factory.updateConstructorDeclaration(
      constructorDeclaration,
      constructorDeclaration.modifiers,
      constructorDeclaration.parameters,
      factory.updateBlock(constructorDeclaration.body, statements),
    );
    newMembers = newMembers.map((member) =>
      member === constructorDeclaration ? newConstructor : member,
    );
  } else if (assignments.length) {
    const statements: ts.Statement[] = [...assignments];
    if (superParameterNames) {
      statements.unshift(
        factory.createExpressionStatement(
          factory.createCallExpression(
            factory.createSuper(),
            undefined,
            superParameterNames.map((name) => factory.createIdentifier(name)),
          ),
        ),
      );
    }
    newMembers = [
      ...newMembers,
      factory.createConstructorDeclaration(
        undefined,
        (superParameterNames ?? []).map((name) =>
          factory.createParameterDeclaration(
            undefined,
            undefined,
            name,
            undefined,
            undefined,
            undefined,
          ),
        ),
        factory.createBlock(statements, true),
      ),
    ];
  }

  if (ts.isClassDeclaration(node)) {
    return factory.updateClassDeclaration(
      node,
      node.modifiers,
      node.name,
      node.typeParameters,
      node.heritageClauses,
      newMembers,
    );
  }
  return factory.updateClassExpression(
    node,
    node.modifiers,
    node.name,
    node.typeParameters,
    node.heritageClauses,
    newMembers,
  );
};

/**
 * Names of the base class constructor parameters, so a synthesized
 * constructor can forward them (undefined when they cannot be determined)
 */
function getBaseConstructorParameterNames(
  this: Transpiler,
  node: ts.ClassLikeDeclaration,
): string[] | undefined {
  const baseNode = this.utils.getExtendedNode(node);
  if (!baseNode || baseNode.pos === -1) return;

  try {
    const baseType = this.typeChecker.getTypeAtLocation(
      ts.isExpressionWithTypeArguments(baseNode)
        ? baseNode.expression
        : baseNode,
    );
    const [signature] = baseType.getConstructSignatures();
    if (!signature) return;

    const names: string[] = [];
    for (const parameter of signature.getParameters()) {
      const declaration = parameter.valueDeclaration;
      if (
        declaration &&
        ts.isParameter(declaration) &&
        (!!declaration.dotDotDotToken || !ts.isIdentifier(declaration.name))
      ) {
        return; // rest/destructured parameters cannot be forwarded by name
      }
      names.push(parameter.name);
    }
    return names;
  } catch {
    return undefined;
  }
}

/** Does the node reference the enclosing this (not counting nested scopes)? */
const referencesThis = (node: ts.Node): boolean => {
  if (
    node.kind === SyntaxKind.ThisKeyword ||
    node.kind === SyntaxKind.SuperKeyword
  ) {
    return true;
  }
  // these create their own `this` scope
  if (
    ts.isClassLike(node) ||
    ts.isFunctionDeclaration(node) ||
    ts.isFunctionExpression(node)
  ) {
    return false;
  }
  return !!ts.forEachChild(node, (child): true | undefined =>
    referencesThis(child) ? true : undefined,
  );
};

export const addDefaultPublicModifier: TransformerFn = function (
  this: Transpiler,
  node,
  context,
  parentNode,
) {
  if (
    !ts.canHaveModifiers(node) ||
    !ts.isClassLike(parentNode) ||
    this.utils.getAccessModifier(node)
  ) {
    return;
  }

  const { true: decorators = [], false: modifiers = [] } = groupBy(
    node.modifiers,
    ts.isDecorator,
  );

  const newModifiers: ts.ModifierLike[] = decorators
    .concat(context.factory.createModifier(SyntaxKind.PublicKeyword))
    .concat(modifiers);

  if (ts.isPropertyDeclaration(node)) {
    return context.factory.updatePropertyDeclaration(
      node,
      newModifiers,
      node.name,
      node.questionToken ?? node.exclamationToken,
      node.type,
      node.initializer,
    );
  }

  if (ts.isGetAccessorDeclaration(node)) {
    return context.factory.updateGetAccessorDeclaration(
      node,
      newModifiers,
      node.name,
      node.parameters,
      node.type,
      node.body,
    );
  }

  if (ts.isSetAccessorDeclaration(node)) {
    return context.factory.updateSetAccessorDeclaration(
      node,
      newModifiers,
      node.name,
      node.parameters,
      node.body,
    );
  }

  if (ts.isConstructorDeclaration(node)) {
    return context.factory.updateConstructorDeclaration(
      node,
      newModifiers,
      node.parameters,
      node.body,
    );
  }

  if (ts.isMethodDeclaration(node)) {
    return context.factory.updateMethodDeclaration(
      node,
      newModifiers,
      node.asteriskToken,
      node.name,
      node.questionToken,
      node.typeParameters,
      node.parameters,
      node.type,
      node.body,
    );
  }
};
