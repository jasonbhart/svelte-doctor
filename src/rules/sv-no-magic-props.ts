import { walk } from 'estree-walker';
import type { Rule } from '../types.js';

export const svNoMagicProps: Rule = {
  id: 'sv-no-magic-props',
  severity: 'error',
  applicableTo: ['svelte-component'],
  description: 'Flags $$props and $$restProps usage. Use $props() destructuring with rest pattern.',
  agentPrompt:
    'Svelte 5 removes `$$props` and `$$restProps`. Use `let { known, ...rest } = $props();` for rest props and access all props via the destructured pattern.',
  analyze: (ast, context) => {
    // Walk both script and template ASTs
    const roots = [ast.instance?.content, ast.fragment].filter(Boolean);

    for (const root of roots) {
      walk(root, {
        enter(node: any) {
          if (
            node.type === 'Identifier' &&
            (node.name === '$$props' || node.name === '$$restProps')
          ) {
            context.report({
              node,
              message: `\`${node.name}\` is removed in Svelte 5. Use \`let { ...rest } = $props();\` instead.`,
            });
          }
        },
      });
    }
  },
  fix: (source, _diagnostic) => {
    let result = source;
    result = result.replace(/\$\$restProps/g, '...rest /* TODO: add rest to $props() destructuring */');
    result = result.replace(/\$\$props/g, '$$props /* TODO: replace with $props() destructuring */');
    return result !== source ? result : null;
  },
};
