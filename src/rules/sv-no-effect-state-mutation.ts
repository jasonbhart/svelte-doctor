import { walk } from 'estree-walker';
import type { Rule } from '../types.js';

export const svNoEffectStateMutation: Rule = {
  id: 'sv-no-effect-state-mutation',
  severity: 'error',
  applicableTo: ['svelte-component'],
  description: 'Flags $state variables mutated inside $effect() (infinite re-render risk).',
  agentPrompt:
    'Do NOT mutate `$state` variables inside `$effect()`. Use `$derived()` instead. If mutation is truly necessary, wrap in `untrack(() => { ... })`.',
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

          // Walk the effect callback body
          walk(effectBody, {
            enter(inner: any) {
              if (
                inner.type === 'AssignmentExpression' &&
                inner.left?.type === 'Identifier' &&
                stateVars.has(inner.left.name)
              ) {
                context.report({
                  node: inner,
                  message: `\`$state\` variable \`${inner.left.name}\` is mutated inside \`$effect()\`. This can cause infinite re-renders. Use \`$derived()\` instead.`,
                });
              }
            },
          });
        }
      },
    });
  },
};
