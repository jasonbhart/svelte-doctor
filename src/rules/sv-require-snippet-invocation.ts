import { walk } from 'estree-walker';
import type { Rule } from '../types.js';

export const svRequireSnippetInvocation: Rule = {
  id: 'sv-require-snippet-invocation',
  severity: 'error',
  applicableTo: ['svelte-component'],
  description: 'Flags {@render snippet} without parentheses invocation.',
  agentPrompt:
    'Snippets must be invoked with parentheses. Change `{@render foo}` to `{@render foo()}` or `{@render foo?.()}`.',
  analyze: (ast, context) => {
    if (!ast.fragment) return;

    walk(ast.fragment, {
      enter(node: any) {
        if (
          node.type === 'RenderTag' &&
          node.expression?.type === 'Identifier'
        ) {
          context.report({
            node,
            message: `\`{@render ${node.expression.name}}\` is missing parentheses. Use \`{@render ${node.expression.name}()}\` or \`{@render ${node.expression.name}?.()}\`.`,
          });
        }
      },
    });
  },
  fix: (source, _diagnostic) => {
    // Fix {@render identifier} -> {@render identifier()}
    const result = source.replace(
      /\{@render\s+(\w+)\s*\}/g,
      '{@render $1()}'
    );
    return result !== source ? result : null;
  },
};
