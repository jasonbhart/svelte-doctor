import { walk } from 'estree-walker';
import type { Rule } from '../types.js';

export const svPreferSnippets: Rule = {
  id: 'sv-prefer-snippets',
  severity: 'error',
  applicableTo: ['svelte-component'],
  description: 'Flags legacy <slot> usage. Use {#snippet} and {@render} instead.',
  agentPrompt:
    'Svelte 5 replaces `<slot>` with snippets. Use `{@render children?.()}` for default slot. Declare snippet props via `$props()`: `let { children, header } = $props();`',
  analyze: (ast, context) => {
    if (!ast.fragment) return;

    walk(ast.fragment, {
      enter(node: any) {
        if (node.type === 'SlotElement') {
          const slotName = node.attributes?.find(
            (a: any) => a.type === 'Attribute' && a.name === 'name'
          );
          const name = slotName
            ? (slotName.value?.[0]?.data ?? 'named')
            : 'default';

          context.report({
            node,
            message: `Legacy \`<slot${name !== 'default' ? ` name="${name}"` : ''}>\` detected. Use \`{@render ${name === 'default' ? 'children' : name}?.()}\` instead.`,
          });
        }
      },
    });
  },
};
