import { walk } from 'estree-walker';
import type { Rule } from '../types.js';

export const svNoEventDispatcher: Rule = {
  id: 'sv-no-event-dispatcher',
  severity: 'error',
  applicableTo: ['svelte-component'],
  description: 'Flags createEventDispatcher usage. Use callback props instead.',
  agentPrompt:
    'Svelte 5 removes `createEventDispatcher`. Pass callback functions as props instead. Replace `dispatch(\'submit\', data)` with `onsubmit?.(data)` where `let { onsubmit } = $props();`',
  analyze: (ast, context) => {
    if (!ast.instance) return;

    walk(ast.instance.content, {
      enter(node: any) {
        // Detect import of createEventDispatcher
        if (
          node.type === 'ImportDeclaration' &&
          node.source?.value === 'svelte'
        ) {
          const hasDispatcher = node.specifiers?.some(
            (s: any) =>
              (s.type === 'ImportSpecifier' && s.imported?.name === 'createEventDispatcher')
          );
          if (hasDispatcher) {
            context.report({
              node,
              message:
                'Legacy `createEventDispatcher` import detected. Use callback props via `$props()` instead.',
            });
          }
        }

        // Detect createEventDispatcher() call
        if (
          node.type === 'VariableDeclarator' &&
          node.init?.type === 'CallExpression' &&
          node.init.callee?.name === 'createEventDispatcher'
        ) {
          context.report({
            node,
            message:
              '`createEventDispatcher()` is deprecated in Svelte 5. Pass callback functions as props instead.',
          });
        }
      },
    });
  },
};
