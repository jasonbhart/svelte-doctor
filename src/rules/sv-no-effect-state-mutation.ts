import { walk } from 'estree-walker';
import type { Rule } from '../types.js';

export const svNoEffectStateMutation: Rule = {
  id: 'sv-no-effect-state-mutation',
  severity: 'warning',
  applicableTo: ['svelte-component'],
  description: 'Flags $state variables mutated inside $effect() without untrack().',
  agentPrompt:
    'Mutating `$state` inside `$effect()` can cause infinite re-renders if the mutated variable is also read by the effect. Consider: (1) Use `$derived()` if the value is purely computed. (2) Use `untrack(() => { ... })` if mutation is intentional. (3) Guard with a condition to prevent re-triggering.',
  analyze: (ast, context) => {
    if (!ast.instance) return;

    // Step 1: Collect $state variable names
    const stateVars = new Set<string>();
    walk(ast.instance.content, {
      enter(node: any) {
        if (
          node.type === 'VariableDeclaration' &&
          node.declarations
        ) {
          for (const decl of node.declarations) {
            if (
              decl.init?.type === 'CallExpression' &&
              decl.init.callee?.name === '$state' &&
              decl.id?.type === 'Identifier'
            ) {
              stateVars.add(decl.id.name);
            }
          }
        }
      },
    });

    if (stateVars.size === 0) return;

    // Step 2: Find $effect() calls and check for state mutation
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

          // Walk the effect callback body, but skip nested untrack() calls
          walk(effectBody, {
            enter(inner: any) {
              // Skip inside untrack() blocks
              if (
                inner.type === 'CallExpression' &&
                inner.callee?.type === 'Identifier' &&
                inner.callee.name === 'untrack'
              ) {
                this.skip();
                return;
              }

              if (
                inner.type === 'AssignmentExpression' &&
                inner.left?.type === 'Identifier' &&
                stateVars.has(inner.left.name)
              ) {
                context.report({
                  node: inner,
                  message: `\`$state\` variable \`${inner.left.name}\` is mutated inside \`$effect()\`. If this is intentional, wrap in \`untrack()\` to prevent re-triggering. If the value is purely computed, use \`$derived()\` instead.`,
                });
              }
            },
          });
        }
      },
    });
  },
};
