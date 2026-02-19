import { walk } from 'estree-walker';
import type { Rule } from '../types.js';

export const svNoSvelteComponent: Rule = {
  id: 'sv-no-svelte-component',
  severity: 'warning',
  applicableTo: ['svelte-component'],
  description: 'Flags <svelte:component this={...} /> usage.',
  agentPrompt:
    'Svelte 5 supports dynamic components directly: `<MyComponent />` where `MyComponent` is a variable. Replace `<svelte:component this={comp} />` with `<comp />` (or `{@const Tag = comp} <Tag />` if needed).',
  analyze: (ast, context) => {
    if (!ast.fragment) return;

    walk(ast.fragment, {
      enter(node: any) {
        if (node.type === 'SvelteComponent') {
          context.report({
            node,
            message: '`<svelte:component this={...}>` is deprecated in Svelte 5. Use the component variable directly as a tag: `<Component />`.',
          });
        }
      },
    });
  },
};
