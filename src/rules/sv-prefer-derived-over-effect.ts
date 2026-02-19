import { walk } from 'estree-walker';
import type { Rule } from '../types.js';

export const svPreferDerivedOverEffect: Rule = {
  id: 'sv-prefer-derived-over-effect',
  severity: 'warning',
  applicableTo: ['svelte-component'],
  description: 'Flags $effect() that could be replaced with $derived().',
  agentPrompt:
    'This `$effect()` only assigns a single variable from a computation. Replace with `$derived()`: `let x = $derived(expr);` instead of `$effect(() => { x = expr; })`.',
  analyze: (ast, context) => {
    if (!ast.instance) return;

    walk(ast.instance.content, {
      enter(node: any) {
        if (
          node.type === 'ExpressionStatement' &&
          node.expression?.type === 'CallExpression' &&
          node.expression.callee?.name === '$effect' &&
          node.expression.arguments?.[0]
        ) {
          const callback = node.expression.arguments[0];
          const body = callback.body;

          // Check if the callback body is a BlockStatement with exactly one statement
          if (body?.type === 'BlockStatement' && body.body?.length === 1) {
            const stmt = body.body[0];
            if (
              stmt.type === 'ExpressionStatement' &&
              stmt.expression?.type === 'AssignmentExpression'
            ) {
              const varName = stmt.expression.left?.name ?? 'variable';
              context.report({
                node,
                message: `\`$effect()\` only assigns \`${varName}\`. Use \`let ${varName} = $derived(expr)\` instead for reactive derivation.`,
              });
            }
          }
        }
      },
    });
  },
};
