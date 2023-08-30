import { type TransformerFn } from './Transformer';

import * as api from './api';
import * as lang from './lang';

export * from './Transformer';
export { api, lang };

// Order here actually matters (to some extent)
export const TRANSFORMERS: TransformerFn[] = [
  api.transformJsApiAccess,
  api.transformJsIdentifiers,
  api.transformTsLibTypes,
  lang.transformImportDeclaration,
  lang.transformVariableStatement,
  lang.transformVariableDeclarationList,
  lang.transformVariableDeclaration,
  lang.transformBooleanOperatorInVariableDeclaration,
  lang.transformClassDeclaration,
  lang.transformEnumDeclaration,
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
  lang.transformMethodOnObject,
  lang.transformArrowFunction,
  lang.transformFunctionParameter,
  lang.transformCallExpression,
  lang.transformPowExpression,
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
