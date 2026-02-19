import { walk } from 'estree-walker';
import type { Rule } from '../types.js';

export const svRequireNativeEvents: Rule = {
  id: 'sv-require-native-events',
  severity: 'error',
  applicableTo: ['svelte-component'],
  description: 'Flags on:event directive syntax. Use onevent attributes instead.',
  agentPrompt:
    'Svelte 5 uses standard HTML event attributes. Replace `on:click={handler}` with `onclick={handler}`. For modifiers like `|preventDefault`, call `event.preventDefault()` inside the handler.',
  analyze: (ast, context) => {
    if (!ast.fragment) return;

    walk(ast.fragment, {
      enter(node: any) {
        if (node.type === 'OnDirective') {
          context.report({
            node,
            message: `Legacy \`on:${node.name}\` directive detected. Use \`on${node.name}={handler}\` instead.`,
          });
        }
      },
    });
  },
};
