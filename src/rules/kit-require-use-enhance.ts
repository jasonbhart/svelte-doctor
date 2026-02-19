import { walk } from 'estree-walker';
import type { Rule } from '../types.js';

export const kitRequireUseEnhance: Rule = {
  id: 'kit-require-use-enhance',
  severity: 'warning',
  applicableTo: ['svelte-component'],
  description: 'Flags POST forms without use:enhance for progressive enhancement.',
  agentPrompt:
    'SvelteKit forms with `method="POST"` should use `use:enhance` for progressive enhancement. Add `use:enhance` to the form and import `enhance` from `\'$app/forms\'`.',
  analyze: (ast, context) => {
    if (!ast.fragment) return;

    walk(ast.fragment, {
      enter(node: any) {
        if (node.type === 'RegularElement' && node.name === 'form') {
          const methodAttr = node.attributes?.find(
            (a: any) =>
              a.type === 'Attribute' &&
              a.name === 'method' &&
              a.value?.[0]?.data?.toUpperCase() === 'POST'
          );

          if (!methodAttr) return;

          const hasEnhance = node.attributes?.some(
            (a: any) => a.type === 'UseDirective' && a.name === 'enhance'
          );

          if (!hasEnhance) {
            context.report({
              node,
              message:
                'POST form is missing `use:enhance`. Add it for progressive enhancement.',
            });
          }
        }
      },
    });
  },
};
