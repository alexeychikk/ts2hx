import ts from 'typescript';
import { type EmitFn, type VisitNodeContext } from '../Transpiler';

/**
 * Emits metadata that's been added to nodes (like @:async, @:await)
 */
export const transformNodeMetadata: EmitFn = function (this, node, context) {
  // Skip if this node doesn't have metadata
  const metadata = this.nodeMetadata.get(node);
  if (!metadata || metadata.length === 0) return;

  // For functions, methods, and other nodes that should have metadata
  if (ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node) ||
      ts.isFunctionExpression(node) || ts.isArrowFunction(node) ||
      ts.isCallExpression(node)) {
    
    // Metadata is added to the start of the node
    return `${metadata.join(' ')} `;
  }
  
  return;
};