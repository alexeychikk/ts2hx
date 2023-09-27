import { type TransformerFn, type EmitFn } from './Transpiler';

import * as api from './api';
import * as lang from './lang';
import * as tr from './ts';

export * from './Transpiler';
export { api, lang };

export const TRANSFORMERS: TransformerFn[] = [
  tr.transformPowExpression,
  tr.transformMethodOnObject,
];

// Order here actually matters (to some extent)
export const EMITTERS: EmitFn[] = [
  api.transformJsApiAccess,
  api.transformJsIdentifiers,
  api.transformTsLibTypes,
  lang.transformImportDeclaration,
  lang.transformVariableStatement,
  lang.transformVariableDeclarationList,
  lang.transformVariableDeclaration,
  lang.transformObjectBindingPattern,
  lang.transformArrayBindingPattern,
  lang.transformBooleanOperatorInVariableDeclaration,
  lang.transformClassDeclaration,
  lang.transformEnumDeclaration,
  lang.transformIndexedAccessType,
  lang.transformHeritageClause,
  lang.transformConstructor,
  lang.transformClassPropertyDeclaration,
  lang.transformClassMethodDeclaration,
  lang.transformClassGetter,
  lang.transformClassSetter,
  lang.transformForLoop,
  lang.transformForOfLoop,
  lang.transformForInLoop,
  lang.transformSwitchCase,
  lang.transformNotOperator,
  lang.transformConditions,
  lang.transformObjectLiteralExpression,
  lang.transformPropertySignature,
  lang.transformIndexSignature,
  lang.transformMethodSignature,
  lang.transformConstructorSignature,
  lang.transformPropertyAssignment,
  lang.transformShorthandPropertyAssignment,
  lang.transformElementAccess,
  lang.transformElementWriteToObject,
  lang.transformGetSet,
  lang.transformArrowFunction,
  lang.transformFunctionParameter,
  lang.transformCallExpression,
  lang.transformInstanceOfExpression,
  lang.transformVoidExpression,
  lang.transformAsExpression,
  lang.transformTypeofExpression,
  lang.transformTypeParameter,
  lang.transformConditionalType,
  lang.transformTypeQuery,
  lang.transformRegex,
  lang.transformSimpleTemplate,
  lang.transformTemplateExpression,
  lang.transformTemplateParts,
  lang.transformLiteralTypes,
  lang.transformArrayType,
  lang.transformUnionType,
  lang.transformTupleType,
  lang.transformKeywords,
  lang.transformRenameSymbol,
];
