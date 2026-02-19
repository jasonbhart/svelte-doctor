import { walk } from 'estree-walker';
import type { Rule } from '../types.js';

export const svNoEventModifiers: Rule = {
  id: 'sv-no-event-modifiers',
  severity: 'warning',
  applicableTo: ['svelte-component'],
  description: 'Flags on:event|modifier syntax. Modifiers need manual refactoring to inline code.',
  agentPrompt:
    'Svelte 5 removes event modifiers like `|preventDefault`. Instead, call `event.preventDefault()` inside the handler function. Replace `on:click|preventDefault={handler}` with `onclick={(e) => { e.preventDefault(); handler(e); }}`.',
  analyze: (ast, context) => {
    if (!ast.fragment) return;

    walk(ast.fragment, {
      enter(node: any) {
        if (
          node.type === 'OnDirective' &&
          node.modifiers &&
          node.modifiers.length > 0
        ) {
          const mods = node.modifiers.join('|');
          context.report({
            node,
            message: `Event modifier \`|${mods}\` on \`on:${node.name}\` detected. Svelte 5 removes event modifiers. Call \`event.${node.modifiers[0]}()\` inside the handler instead.`,
          });
        }
      },
    });
  },
};
