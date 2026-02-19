import { walk } from 'estree-walker';
import type { Rule } from '../types.js';
import { buildComponentContext, isAsyncEffect, hasCleanupReturn } from '../analysis/svelteComponentContext.js';

export const svPreferDerivedOverEffect: Rule = {
  id: 'sv-prefer-derived-over-effect',
  severity: 'warning',
  applicableTo: ['svelte-component'],
  description: 'Flags $effect() that could be replaced with $derived().',
  agentPrompt:
    'This `$effect()` only assigns a single variable from a computation. Replace with `$derived()`: `let x = $derived(expr);` instead of `$effect(() => { x = expr; })`. Skip if the variable is also written by event handlers or is a `$bindable` prop.',
  analyze: (ast, context) => {
    const componentCtx = buildComponentContext(ast);
    if (!componentCtx) return;

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

          // Only flag single-assignment effect bodies
          if (body?.type !== 'BlockStatement' || body.body?.length !== 1) return;

          const stmt = body.body[0];
          if (
            stmt.type !== 'ExpressionStatement' ||
            stmt.expression?.type !== 'AssignmentExpression'
          ) {
            return;
          }

          const varName = stmt.expression.left?.name;
          if (!varName) return;

          // Suppress: $bindable variable — can't be $derived
          if (componentCtx.bindableVars.has(varName)) return;

          // Suppress: variable is also written outside effects (event handlers, functions, top-level)
          const sites = componentCtx.writeSites.get(varName) ?? [];
          const hasNonEffectWrite = sites.some((s) => s.kind !== 'effect');
          if (hasNonEffectWrite) return;

          // Suppress: async effect (await means side-effect, not pure derivation)
          if (isAsyncEffect(callback)) return;

          // Suppress: effect has cleanup return (indicates side-effect management)
          if (hasCleanupReturn(callback)) return;

          context.report({
            node,
            message: `\`$effect()\` only assigns \`${varName}\`. Use \`let ${varName} = $derived(expr)\` instead — unless \`${varName}\` is also written elsewhere (e.g. event handlers, \`$bindable\` props).`,
          });
        }
      },
    });
  },
};
