import { walk } from 'estree-walker';
import type { Rule } from '../types.js';

export const svNoReactiveStatements: Rule = {
  id: 'sv-no-reactive-statements',
  severity: 'error',
  applicableTo: ['svelte-component'],
  description: 'Flags legacy Svelte 4 $: reactive statements.',
  agentPrompt:
    'This is Svelte 5. Replace `$: x = expr` with `let x = $derived(expr)`. Replace `$: { block }` with `$effect(() => { block })`.',
  analyze: (ast, context) => {
    if (!ast.instance) return;

    walk(ast.instance.content, {
      enter(node: any) {
        if (node.type === 'LabeledStatement' && node.label?.name === '$') {
          context.report({
            node,
            message:
              'Legacy Svelte 4 `$:` reactive statement detected. Use `$derived()` or `$effect()` instead.',
          });
        }
      },
    });
  },
  fix: (source, _diagnostic) => {
    // Fix $: x = expr -> let x = $derived(expr)
    let result = source.replace(
      /\$:\s+(\w+)\s*=\s*(.+);/g,
      'let $1 = $derived($2);'
    );
    // Fix $: { block } -> $effect(() => { block })
    result = result.replace(
      /\$:\s*\{([^}]+)\}/g,
      '$effect(() => {$1})'
    );
    return result !== source ? result : null;
  },
};
