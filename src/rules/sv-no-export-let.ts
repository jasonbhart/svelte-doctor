import { walk } from 'estree-walker';
import type { Rule } from '../types.js';

export const svNoExportLet: Rule = {
  id: 'sv-no-export-let',
  severity: 'error',
  applicableTo: ['svelte-component'],
  description: 'Flags legacy Svelte 4 export let props.',
  agentPrompt:
    'This is Svelte 5. Replace all `export let` props with a single `let { ...props } = $props()` destructuring.',
  analyze: (ast, context) => {
    if (!ast.instance) return;

    walk(ast.instance.content, {
      enter(node: any) {
        // Detect: export let prop
        if (
          node.type === 'ExportNamedDeclaration' &&
          node.declaration?.type === 'VariableDeclaration' &&
          node.declaration.kind === 'let'
        ) {
          context.report({
            node,
            message:
              'Legacy Svelte 4 `export let` prop detected. Use `let { prop } = $props()` instead.',
          });
        }
      },
    });
  },
};
