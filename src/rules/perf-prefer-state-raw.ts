import { walk } from 'estree-walker';
import type { Rule } from '../types.js';

export const perfPreferStateRaw: Rule = {
  id: 'perf-prefer-state-raw',
  severity: 'warning',
  applicableTo: ['svelte-component'],
  description: 'Suggests $state.raw() for large data structures to avoid deep reactivity overhead.',
  agentPrompt:
    'Large arrays (>20 items) and objects (>10 properties) in `$state()` create deep reactive proxies with significant overhead. Use `$state.raw()` instead and trigger updates by reassignment: `items = [...items, newItem]`.',
  analyze: (ast, context) => {
    if (!ast.instance) return;

    walk(ast.instance.content, {
      enter(node: any) {
        if (
          node.type === 'VariableDeclaration'
        ) {
          for (const decl of node.declarations) {
            if (
              decl.init?.type === 'CallExpression' &&
              decl.init.callee?.name === '$state' &&
              decl.init.arguments?.[0]
            ) {
              const arg = decl.init.arguments[0];
              const varName = decl.id?.name ?? 'variable';

              // Check array literal with >20 elements
              if (arg.type === 'ArrayExpression' && arg.elements?.length > 20) {
                context.report({
                  node: decl,
                  message: `\`$state()\` for \`${varName}\` contains ${arg.elements.length} array elements. Consider \`$state.raw()\` to avoid deep reactivity overhead.`,
                });
              }

              // Check object literal with >10 properties
              if (arg.type === 'ObjectExpression' && arg.properties?.length > 10) {
                context.report({
                  node: decl,
                  message: `\`$state()\` for \`${varName}\` contains ${arg.properties.length} object properties. Consider \`$state.raw()\` to avoid deep reactivity overhead.`,
                });
              }
            }
          }
        }
      },
    });
  },
};
