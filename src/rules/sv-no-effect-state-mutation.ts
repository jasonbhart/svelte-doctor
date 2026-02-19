import { walk } from 'estree-walker';
import type { Rule } from '../types.js';
import { buildComponentContext, isIdentifierReadInSubtree, isAsyncEffect } from '../analysis/svelteComponentContext.js';

export const svNoEffectStateMutation: Rule = {
  id: 'sv-no-effect-state-mutation',
  severity: 'warning',
  applicableTo: ['svelte-component'],
  description: 'Flags $state variables mutated inside $effect() without untrack().',
  agentPrompt:
    'Mutating `$state` inside `$effect()` can cause infinite re-renders if the mutated variable is also read by the effect. Consider: (1) Use `$derived()` if the value is purely computed. (2) Use `untrack(() => { ... })` if mutation is intentional. (3) Guard with a condition to prevent re-triggering.',
  analyze: (ast, context) => {
    const componentCtx = buildComponentContext(ast);
    if (!componentCtx) return;

    if (componentCtx.stateVars.size === 0) return;

    walk(ast.instance.content, {
      enter(node: any) {
        if (
          node.type === 'ExpressionStatement' &&
          node.expression?.type === 'CallExpression' &&
          node.expression.callee?.name === '$effect' &&
          node.expression.arguments?.[0]
        ) {
          const effectBody = node.expression.arguments[0];

          // Check if the entire effect body is wrapped in untrack()
          let isUntracked = false;
          if (effectBody.type === 'ArrowFunctionExpression' && effectBody.body?.type === 'BlockStatement') {
            const stmts = effectBody.body.body;
            if (stmts?.length === 1 &&
              stmts[0].type === 'ExpressionStatement' &&
              stmts[0].expression?.type === 'CallExpression' &&
              stmts[0].expression.callee?.name === 'untrack') {
              isUntracked = true;
            }
          }
          if (isUntracked) return;

          // Suppress: async effects break the synchronous re-trigger chain
          if (isAsyncEffect(effectBody)) return;

          // Walk the effect callback body, but skip nested untrack() calls
          walk(effectBody, {
            enter(inner: any, parent: any) {
              // Skip inside untrack() blocks
              if (
                inner.type === 'CallExpression' &&
                inner.callee?.type === 'Identifier' &&
                inner.callee.name === 'untrack'
              ) {
                this.skip();
                return;
              }

              let mutatedVar: string | null = null;
              if (inner.type === 'AssignmentExpression' && inner.left?.type === 'Identifier') {
                mutatedVar = inner.left.name;
              } else if (inner.type === 'UpdateExpression' && inner.argument?.type === 'Identifier') {
                mutatedVar = inner.argument.name;
              }

              if (mutatedVar && componentCtx.stateVars.has(mutatedVar)) {

                // Suppress: $bindable variable
                if (componentCtx.bindableVars.has(mutatedVar)) return;

                // Suppress: no read-write overlap (variable is written but not read in the effect)
                // The actual infinite-loop risk only exists when the variable is both read and written
                if (!isIdentifierReadInSubtree(effectBody, mutatedVar)) return;

                // Suppress: conditional assignment or guard clause (prevents infinite loop)
                if (isInsideConditional(inner, effectBody)) return;
                if (hasGuardClause(effectBody, mutatedVar)) return;

                context.report({
                  node: inner,
                  message: `\`$state\` variable \`${mutatedVar}\` is mutated inside \`$effect()\`. If this is intentional, wrap in \`untrack()\` to prevent re-triggering. If the value is purely computed, use \`$derived()\` instead.`,
                });
              }
            },
          });
        }
      },
    });
  },
};

/**
 * Check if a node is inside a conditional (if/ternary) within the given scope.
 * This indicates a guard that prevents infinite re-triggering.
 */
function isInsideConditional(targetNode: any, scopeRoot: any): boolean {
  let found = false;

  walk(scopeRoot, {
    enter(node: any) {
      if (found) {
        this.skip();
        return;
      }

      // Check if this is an IfStatement containing the target assignment
      if (node.type === 'IfStatement') {
        if (subtreeContainsNode(node.consequent, targetNode) ||
            (node.alternate && subtreeContainsNode(node.alternate, targetNode))) {
          found = true;
          this.skip();
        }
      }

      // Check ternary/conditional expression
      if (node.type === 'ConditionalExpression') {
        if (subtreeContainsNode(node.consequent, targetNode) ||
            subtreeContainsNode(node.alternate, targetNode)) {
          found = true;
          this.skip();
        }
      }
    },
  });

  return found;
}

function subtreeContainsNode(subtree: any, target: any): boolean {
  if (subtree === target) return true;

  let found = false;
  walk(subtree, {
    enter(node: any) {
      if (node === target) {
        found = true;
        this.skip();
      }
      if (found) this.skip();
    },
  });

  return found;
}

/**
 * Detect guard clause pattern: `if (varName) return;` or `if (!condition || varName) return;`
 * before the assignment. This prevents re-triggering because on re-run the effect exits early.
 */
function hasGuardClause(effectCallback: any, varName: string): boolean {
  const body = effectCallback.body;
  if (body?.type !== 'BlockStatement') return false;

  for (const stmt of body.body) {
    if (stmt.type !== 'IfStatement') continue;

    // Check if the consequent is an early return
    const consequent = stmt.consequent;
    const isEarlyReturn =
      (consequent.type === 'ReturnStatement') ||
      (consequent.type === 'BlockStatement' &&
       consequent.body?.length === 1 &&
       consequent.body[0].type === 'ReturnStatement');

    if (!isEarlyReturn) continue;

    // Check if the condition reads the variable
    if (conditionReadsVar(stmt.test, varName)) return true;
  }

  return false;
}

function conditionReadsVar(test: any, varName: string): boolean {
  // Direct: `if (varName)` or `if (!varName)`
  if (test.type === 'Identifier' && test.name === varName) return true;
  if (test.type === 'UnaryExpression' && test.operator === '!' && test.argument?.type === 'Identifier' && test.argument.name === varName) return true;

  // Logical: `if (a || varName)` / `if (a && varName)`
  if (test.type === 'LogicalExpression') {
    return conditionReadsVar(test.left, varName) || conditionReadsVar(test.right, varName);
  }

  // Binary: `if (varName > 5)` / `if (varName === true)`
  if (test.type === 'BinaryExpression') {
    return conditionReadsVar(test.left, varName) || conditionReadsVar(test.right, varName);
  }

  // Negated expressions: `if (!(varName))` or `if (!(varName > 5))`
  if (test.type === 'UnaryExpression' && test.operator === '!') {
    return conditionReadsVar(test.argument, varName);
  }

  return false;
}
