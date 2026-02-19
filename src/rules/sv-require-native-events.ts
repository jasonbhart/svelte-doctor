import { walk } from 'estree-walker';
import type { Rule } from '../types.js';

export const svRequireNativeEvents: Rule = {
  id: 'sv-require-native-events',
  severity: 'error',
  applicableTo: ['svelte-component'],
  description: 'Flags on:event directive syntax, including modifiers. Use onevent attributes instead.',
  agentPrompt:
    'Svelte 5 uses standard HTML event attributes. Replace `on:click={handler}` with `onclick={handler}`. For modifiers like `|preventDefault`, remove the modifier and call `event.preventDefault()` inside the handler.',
  analyze: (ast, context) => {
    if (!ast.fragment) return;

    walk(ast.fragment, {
      enter(node: any) {
        if (node.type === 'OnDirective') {
          const hasModifiers = node.modifiers && node.modifiers.length > 0;

          if (hasModifiers) {
            const mods = node.modifiers.join('|');
            context.report({
              node,
              message: `Legacy \`on:${node.name}|${mods}\` directive with modifiers detected. Use \`on${node.name}={handler}\` and call \`event.${node.modifiers[0]}()\` inside the handler instead.`,
            });
          } else {
            context.report({
              node,
              message: `Legacy \`on:${node.name}\` directive detected. Use \`on${node.name}={handler}\` instead.`,
            });
          }
        }
      },
    });
  },
  fix: (source) => {
    // Replace on:event={handler} with onevent={handler}
    // Does NOT match on:event|modifier (the pipe stops the \w+ match before =)
    const result = source.replace(/on:(\w+)(\s*=)/g, 'on$1$2');
    return result !== source ? result : null;
  },
};
